import { BadRequestException, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { mkdirSync, mkdtempSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import gdal from './gdal.js';
import { RiverStreamsService } from './river-streams.service.js';

describe('river streams', () => {
  const previousDataDir = process.env.WATERSHED_DATA_DIR;
  let directory: string;
  let service: RiverStreamsService;

  beforeAll(() => {
    directory = mkdtempSync(join(tmpdir(), 'river-stream-test-'));
    mkdirSync(join(directory, 'river_stream'));
    const dataset = gdal.drivers.get('FlatGeobuf').create(join(directory, 'river_stream', 'waterways.fgb'));
    const srs = gdal.SpatialReference.fromProj4('+proj=longlat +datum=WGS84 +no_defs');
    const layer = dataset.layers.create('waterways', srs, gdal.wkbLineString);
    layer.fields.add([new gdal.FieldDefn('name', gdal.OFTString), new gdal.FieldDefn('waterway', gdal.OFTString)]);
    for (const [name, coordinates] of [
      ['crosses', [[-1, 0.5], [0.5, 0.5]]],
      ['outside', [[-1, 0.5], [-1, 2], [0.5, 2]]],
      ['touches', [[1, 1], [2, 2]]],
    ] as const) {
      const feature = new gdal.Feature(layer);
      feature.fields.set('name', name);
      feature.fields.set('waterway', 'stream');
      feature.setGeometry(gdal.Geometry.fromGeoJson({ type: 'LineString', coordinates }));
      layer.features.add(feature);
    }
    dataset.close();
    process.env.WATERSHED_DATA_DIR = directory;
    service = new RiverStreamsService();
  });

  afterAll(() => {
    if (previousDataDir === undefined) delete process.env.WATERSHED_DATA_DIR;
    else process.env.WATERSHED_DATA_DIR = previousDataDir;
    unlinkSync(join(directory, 'river_stream', 'waterways.fgb'));
    rmdirSync(join(directory, 'river_stream'));
    rmdirSync(directory);
  });

  it('returns only features intersecting the requested bounds', () => {
    const result = service.getStreams('0,0,1,1');
    expect(result.type).toBe('FeatureCollection');
    expect(result.features.map(feature => feature.properties.name).sort((a, b) => (a ?? '').localeCompare(b ?? ''))).toEqual(['crosses', 'touches']);
    expect(result.features.every(feature => feature.properties.waterway === 'stream')).toBe(true);
    expect(service.getStreams('10,10,11,11').features).toEqual([]);
  });

  it.each([undefined, '', '0,0,1', ',0,1,1', '0,0,NaN,1', '1,0,0,1', '-181,0,1,1', '0,-91,1,1'])(
    'rejects invalid bounds %s', value => {
      expect(() => service.getStreams(value)).toThrow(BadRequestException);
    },
  );

  it('buffers a stream by a distance in meters', () => {
    const id = service.getStreams('-1,0,0,1').features.find(feature => feature.properties.name === 'crosses')?.id ?? -1;
    const result = service.getBuffer(id, '1000');
    expect(result.properties).toMatchObject({ stream_id: id, name: 'crosses', waterway: 'stream', distance_m: 1000 });
    // A 1.5 degree line at latitude 0.5 is about 167 km long: 2 * 167 km * 1 km + pi km².
    expect(result.properties.area_km2).toBeGreaterThan(330);
    expect(result.properties.area_km2).toBeLessThan(345);
    const geometry = gdal.Geometry.fromGeoJson(result.geometry as object);
    expect(geometry.wkbType).toBe(gdal.wkbPolygon);
    const bounds = geometry.getEnvelope();
    expect(bounds.maxY).toBeCloseTo(0.5 + 1000 / 110_574, 3);
    expect(bounds.minX).toBeCloseTo(-1 - 1000 / 111_320, 3);
  });

  it.each([undefined, '', '49', '5001', 'abc'])('rejects buffer distance %s', value => {
    expect(() => service.getBuffer(0, value)).toThrow(BadRequestException);
  });

  it('reports a missing stream', () => {
    expect(() => service.getBuffer(99, '100')).toThrow(NotFoundException);
  });

  it('reports an unavailable dataset', () => {
    const log = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      process.env.WATERSHED_DATA_DIR = join(directory, 'missing');
      expect(() => new RiverStreamsService().getStreams('0,0,1,1')).toThrow(ServiceUnavailableException);
      expect(log).toHaveBeenCalled();
    } finally {
      process.env.WATERSHED_DATA_DIR = directory;
      log.mockRestore();
    }
  });
});
