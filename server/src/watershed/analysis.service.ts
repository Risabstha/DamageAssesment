import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import gdal from './gdal.js';
import { PNG } from 'pngjs';
import type { Geometry } from 'gdal-async';
import { resolve } from 'node:path';

const wgs84 = () => gdal.SpatialReference.fromProj4('+proj=longlat +datum=WGS84 +no_defs');
const classes: Record<number, [string, string]> = {
  1: ['Water Bodies', '#419bdf'], 2: ['Trees', '#397d49'],
  4: ['Flooded Vegetation', '#7a87c6'], 5: ['Cropland', '#e49635'],
  7: ['Built-up / Settlement', '#c4281b'], 8: ['Bare Land', '#a59b8f'],
  9: ['Snow & Ice', '#a8ebff'], 11: ['Rangeland', '#e3e2c3'],
};

function round(value: number, decimals: number) {
  const scale = 10 ** decimals;
  return Math.round(value * scale) / scale;
}

@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly dataDir = resolve(process.env.WATERSHED_DATA_DIR || '../../upload/DamageAssesment');

  validate(input: unknown): Geometry {
    let value = input;
    if (value && typeof value === 'object' && 'type' in value) {
      if (value.type === 'Feature' && 'geometry' in value) value = value.geometry;
      else if (value.type === 'FeatureCollection' && 'features' in value && Array.isArray(value.features))
        value = value.features[0]?.geometry;
    }
    if (!value || typeof value !== 'object' || !('type' in value)
      || (value.type !== 'Polygon' && value.type !== 'MultiPolygon')) {
      throw new BadRequestException('Geometry must be a GeoJSON Polygon or MultiPolygon.');
    }
    let geometry: Geometry;
    try { geometry = gdal.Geometry.fromGeoJson(value); }
    catch { throw new BadRequestException('Invalid GeoJSON geometry.'); }
    if (!geometry.isValid()) geometry = geometry.buffer(0, 8);
    if (geometry.isEmpty() || !(geometry instanceof gdal.Polygon || geometry instanceof gdal.MultiPolygon))
      throw new BadRequestException('Geometry must be a non-empty polygon.');
    const bounds = geometry.getEnvelope();
    if (![bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite)
      || bounds.minX < -180 || bounds.maxX > 180 || bounds.minY < -90 || bounds.maxY > 90)
      throw new BadRequestException('Geometry coordinates must be valid WGS84 longitude and latitude.');
    geometry.srs = wgs84();
    return geometry;
  }

  analyze(geom: Geometry) {
    const projected = geom.clone();
    projected.srs = wgs84();
    const zone = geom.centroid().x < 84 ? 44 : 45;
    projected.transformTo(gdal.SpatialReference.fromProj4(`+proj=utm +zone=${zone} +datum=WGS84 +units=m +no_defs`));
    if (!(projected instanceof gdal.Polygon || projected instanceof gdal.MultiPolygon))
      throw new BadRequestException('Expected a polygon.');
    return {
      area_km2: round(projected.getArea() / 1e6, 3),
      population: this.run('population', () => this.population(geom)),
      lulc: this.run('land cover', () => this.lulc(geom)),
      buildings: this.run('buildings', () => this.buildings(geom)),
      wards: this.run('wards', () => this.wards(geom)),
      lulc_overlay: this.run('land cover overlay', () => this.overlay(geom)),
    };
  }

  private run<T>(name: string, operation: () => T): T | { error: string } {
    try { return operation(); }
    catch (error) {
      this.logger.error(`${name} analysis failed`, error instanceof Error ? error.stack : String(error));
      return { error: `${name} analysis failed; check server logs and dataset configuration.` };
    }
  }

  private withFeatures<T>(file: string, geom: Geometry, operation: (layer: gdal.Layer) => T): T {
    const dataset = gdal.open(resolve(this.dataDir, file));
    try {
      const layer = dataset.layers.get(0);
      layer.setSpatialFilter(geom);
      return operation(layer);
    } finally { dataset.close(); }
  }

  private population(geom: Geometry) {
    return this.withFeatures('Population/nepal_polygon.shp', geom, layer => {
      let total = 0, cell_count = 0;
      for (const feature of layer.features) {
        if (!feature.getGeometry()?.intersects(geom)) continue;
        const value: unknown = feature.fields.get('VALUE');
        if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error('Invalid population value');
        total += value; cell_count++;
      }
      return { total: Math.round(total), cell_count };
    });
  }

  private buildings(geom: Geometry) {
    return this.withFeatures('buildings/osm_google_microsoft_buildings_NPL.fgb', geom, layer => {
      const names = layer.fields.getNames();
      const field = names.includes('type') ? 'type' : names.includes('building') ? 'building' : null;
      if (!field) throw new Error('Buildings dataset must contain a type or building column.');
      const counts = new Map<string, number>();
      let total = 0;
      for (const feature of layer.features) {
        if (!feature.getGeometry()?.intersects(geom)) continue;
        const value: unknown = feature.fields.get(field);
        if (value != null && typeof value !== 'string') throw new Error('Invalid building classification');
        const type = value ?? 'unclassified';
        counts.set(type, (counts.get(type) ?? 0) + 1); total++;
      }
      return { total, by_type: [...counts].map(([type, count]) => ({ type, count })).sort((a, b) => b.count - a.count) };
    });
  }

  private wards(geom: Geometry) {
    return this.withFeatures('nepal_wards/npl_admin4.geojson', geom, layer => {
      const wards: { district: string; municipality: string; type: string; ward_number: string; state_code: string; area_sqkm: number }[] = [];
      for (const feature of layer.features) {
        if (!feature.getGeometry()?.intersects(geom)) continue;
        const get = (field: string) => String(feature.fields.get(field) ?? '');
        wards.push({ district: get('DISTRICT'), municipality: get('GaPa_NaPa'), type: get('Type_GN'),
          ward_number: get('NEW_WARD_N'), state_code: get('STATE_CODE'), area_sqkm: round(Number(feature.fields.get('Area_SQKM') ?? 0), 2) });
      }
      const districts = [...new Set(wards.map(w => w.district).filter(Boolean))].sort();
      const municipalities = [...new Set(wards.map(w => w.municipality).filter(Boolean))].sort();
      return { ward_count: wards.length, district_count: districts.length, districts, municipalities, wards };
    });
  }

  private lulc(geom: Geometry) {
    const counts = new Map<number, number>();
    let pixelArea: number | null = null;
    for (const file of ['44R_20250101-20251231.tif', '45R_20250101-20251231.tif']) {
      const raster = gdal.open(resolve(this.dataDir, 'lulc', file));
      try {
        if (!raster.srs) throw new Error('Raster has no coordinate reference system');
        const shape = geom.clone();
        shape.srs = wgs84(); shape.transformTo(raster.srs);
        const bounds = shape.getEnvelope();
        const transform = raster.geoTransform;
        if (!transform) throw new Error('Raster has no geotransform');
        const [originX, stepX, rotX, originY, rotY, stepY] = transform;
        if (rotX !== 0 || rotY !== 0 || stepX <= 0 || stepY >= 0) throw new Error('Unsupported raster transform');
        const x0 = Math.max(0, Math.floor((bounds.minX - originX) / stepX));
        const x1 = Math.min(raster.rasterSize.x, Math.ceil((bounds.maxX - originX) / stepX));
        const y0 = Math.max(0, Math.floor((bounds.maxY - originY) / stepY));
        const y1 = Math.min(raster.rasterSize.y, Math.ceil((bounds.minY - originY) / stepY));
        if (x1 <= x0 || y1 <= y0) continue;
        pixelArea ??= Math.abs(stepX * stepY);
        const vector = gdal.drivers.get('Memory').create('');
        try {
          const layer = vector.layers.create('boundary', raster.srs, gdal.wkbUnknown);
          const feature = new gdal.Feature(layer);
          feature.setGeometry(shape); layer.features.add(feature);
          for (let y = y0; y < y1; y += 128) {
            const width = x1 - x0, height = Math.min(128, y1 - y);
            const mask = gdal.drivers.get('MEM').create('', width, height, 1, gdal.GDT_Byte);
            try {
              mask.srs = raster.srs;
              mask.geoTransform = [originX + x0 * stepX, stepX, 0, originY + y * stepY, 0, stepY];
              gdal.rasterize(mask, vector, ['-burn', '1']);
              const pixels = raster.bands.get(1).pixels.read(x0, y, width, height);
              const selected = mask.bands.get(1).pixels.read(0, 0, width, height);
              for (let i = 0; i < pixels.length; i++) {
                const value = Number(pixels[i]);
                if (selected[i] && value !== 0) counts.set(value, (counts.get(value) ?? 0) + 1);
              }
            } finally { mask.close(); }
          }
        } finally { vector.close(); }
      } finally { raster.close(); }
    }
    const total = [...counts.values()].reduce((sum, value) => sum + value, 0);
    return [...counts].sort(([a], [b]) => a - b).map(([value, count]) => ({
      class_value: value, class_name: classes[value]?.[0] ?? `Class ${value}`,
      color: classes[value]?.[1] ?? '#888888', area_km2: round(count * (pixelArea ?? 100) / 1e6, 4),
      percentage: round(count / total * 100, 1),
    }));
  }

  private overlay(geom: Geometry) {
    const bounds = geom.getEnvelope();
    const padX = Math.max((bounds.maxX - bounds.minX) * 0.02, 0.002);
    const padY = Math.max((bounds.maxY - bounds.minY) * 0.02, 0.002);
    const west = bounds.minX - padX, east = bounds.maxX + padX;
    const south = bounds.minY - padY, north = bounds.maxY + padY;
    const width = 800, height = 600;
    const combined = new Uint8Array(width * height);
    for (const file of ['44R_20250101-20251231.tif', '45R_20250101-20251231.tif']) {
      const source = gdal.open(resolve(this.dataDir, 'lulc', file));
      try {
        const warped = gdal.warp('overlay', null, [source], ['-of', 'MEM', '-t_srs', '+proj=longlat +datum=WGS84 +no_defs',
          '-te', String(west), String(south), String(east), String(north), '-ts', String(width), String(height),
          '-r', 'near', '-dstnodata', '0']);
        try {
          const pixels = warped.bands.get(1).pixels.read(0, 0, width, height);
          for (let i = 0; i < pixels.length; i++) if (pixels[i]) combined[i] = Number(pixels[i]);
        } finally { warped.close(); }
      } finally { source.close(); }
    }
    const vector = gdal.drivers.get('Memory').create('');
    const mask = gdal.drivers.get('MEM').create('', width, height, 1, gdal.GDT_Byte);
    try {
      const layer = vector.layers.create('boundary', wgs84(), gdal.wkbUnknown);
      const feature = new gdal.Feature(layer);
      feature.setGeometry(geom); layer.features.add(feature);
      mask.srs = wgs84();
      mask.geoTransform = [west, (east - west) / width, 0, north, 0, -(north - south) / height];
      gdal.rasterize(mask, vector, ['-burn', '1']);
      const selected = mask.bands.get(1).pixels.read(0, 0, width, height);
      const image = new PNG({ width, height });
      let any = false;
      for (let i = 0; i < combined.length; i++) {
        const color = classes[combined[i]]?.[1];
        if (!selected[i] || !color) continue;
        image.data[i * 4] = parseInt(color.slice(1, 3), 16);
        image.data[i * 4 + 1] = parseInt(color.slice(3, 5), 16);
        image.data[i * 4 + 2] = parseInt(color.slice(5, 7), 16);
        image.data[i * 4 + 3] = 185;
        any = true;
      }
      if (!any) return null;
      return { image: `data:image/png;base64,${PNG.sync.write(image).toString('base64')}`, bounds: [[south, west], [north, east]] };
    } finally { mask.close(); vector.close(); }
  }
}
