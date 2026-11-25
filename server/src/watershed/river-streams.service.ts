import { BadRequestException, HttpException, Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Layer } from 'gdal-async';
import { resolve } from 'node:path';
import gdal from './gdal.js';

type Bounds = [number, number, number, number];

export const MIN_BUFFER_METERS = 10;
export const MAX_BUFFER_METERS = 1000;

const wgs84 = () => gdal.SpatialReference.fromProj4('+proj=longlat +datum=WGS84 +no_defs');

function text(value: unknown) {
  return typeof value === 'string' ? value : null;
}

@Injectable()
export class RiverStreamsService {
  private readonly logger = new Logger(RiverStreamsService.name);
  private readonly dataDir = resolve(process.env.WATERSHED_DATA_DIR || '../../upload/DamageAssesment');

  getStreams(rawBounds: unknown) {
    const [west, south, east, north] = this.parseBounds(rawBounds);
    return this.withLayer(layer => {
      layer.setSpatialFilter(west, south, east, north);
      const extent = gdal.Geometry.fromGeoJson({
        type: 'Polygon',
        coordinates: [[[west, south], [east, south], [east, north], [west, north], [west, south]]],
      });
      const features: { type: 'Feature'; id: number; geometry: unknown; properties: { name: string | null; waterway: string | null } }[] = [];
      for (const feature of layer.features) {
        const geometry = feature.getGeometry();
        if (!geometry || !geometry.intersects(extent)) continue;
        features.push({
          type: 'Feature',
          id: feature.fid,
          geometry: JSON.parse(geometry.toJSON()) as unknown,
          properties: { name: text(feature.fields.get('name')), waterway: text(feature.fields.get('waterway')) },
        });
      }
      return { type: 'FeatureCollection', features };
    });
  }

  getBuffer(id: number, rawDistance: unknown) {
    const distance = typeof rawDistance === 'string' && rawDistance.trim() ? Number(rawDistance) : NaN;
    if (!Number.isFinite(distance) || distance < MIN_BUFFER_METERS || distance > MAX_BUFFER_METERS)
      throw new BadRequestException(`Buffer distance must be between ${MIN_BUFFER_METERS} and ${MAX_BUFFER_METERS} meters.`);
    if (!Number.isSafeInteger(id) || id < 0) throw new NotFoundException('River stream not found.');
    return this.withLayer(layer => {
      const feature = id < layer.features.count() ? layer.features.get(id) : null;
      const geometry = feature?.getGeometry()?.clone();
      if (!feature || !geometry || geometry.isEmpty()) throw new NotFoundException('River stream not found.');
      geometry.srs = wgs84();
      const center = geometry.getEnvelope();
      // A local azimuthal equidistant projection keeps buffer distances in meters accurate around the stream.
      const local = gdal.SpatialReference.fromProj4(
        `+proj=aeqd +lat_0=${(center.minY + center.maxY) / 2} +lon_0=${(center.minX + center.maxX) / 2} +datum=WGS84 +units=m +no_defs`,
      );
      geometry.transformTo(local);
      const buffer = geometry.buffer(distance, 16);
      const area = buffer instanceof gdal.Polygon || buffer instanceof gdal.MultiPolygon ? buffer.getArea() : 0;
      buffer.srs = local;
      buffer.transformTo(wgs84());
      return {
        type: 'Feature',
        geometry: JSON.parse(buffer.toJSON()) as unknown,
        properties: {
          stream_id: id,
          name: text(feature.fields.get('name')),
          waterway: text(feature.fields.get('waterway')),
          distance_m: distance,
          area_km2: Math.round(area / 1e3) / 1e3,
        },
      };
    });
  }

  private withLayer<T>(operation: (layer: Layer) => T): T {
    try {
      const dataset = gdal.open(resolve(this.dataDir, 'river_stream', 'waterways.fgb'));
      try {
        const layer = dataset.layers.get(0);
        if (!layer.srs || !layer.srs.isGeographic() || !layer.srs.isSameGeogCS(wgs84())) {
          throw new Error('River dataset must use WGS84 longitude/latitude coordinates.');
        }
        return operation(layer);
      } finally {
        dataset.close();
      }
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error('Could not read river streams', error instanceof Error ? error.stack : String(error));
      throw new ServiceUnavailableException('River streams are unavailable. Check the server dataset configuration.');
    }
  }

  private parseBounds(value: unknown): Bounds {
    if (typeof value !== 'string') throw new BadRequestException('Provide bbox as west,south,east,north.');
    const parts = value.split(',');
    if (parts.length !== 4 || parts.some(part => !part.trim()))
      throw new BadRequestException('Provide bbox as west,south,east,north.');
    const [west, south, east, north] = parts.map(Number);
    if (![west, south, east, north].every(Number.isFinite)
      || west < -180 || east > 180 || south < -90 || north > 90
      || west >= east || south >= north) {
      throw new BadRequestException('Invalid WGS84 bounding box.');
    }
    return [west, south, east, north];
  }
}
