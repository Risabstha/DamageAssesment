import { BadRequestException } from '@nestjs/common';
import { AnalysisService } from './analysis.service.js';
import gdal from './gdal.js';

describe('watershed geometry', () => {
  const analysis = new AnalysisService();
  const polygon = { type: 'Polygon', coordinates: [[[83, 28], [83.01, 28], [83.01, 28.01], [83, 28.01], [83, 28]]] };

  it('accepts a feature collection and retains its geometry', () => {
    const geom = analysis.validate({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: polygon }] });
    expect(geom.name).toBe('POLYGON');
    expect(geom.getEnvelope().minX).toBe(83);
  });

  it('rejects non-polygon and out-of-range input', () => {
    expect(() => analysis.validate({ type: 'Point', coordinates: [83, 28] })).toThrow(BadRequestException);
    expect(() => analysis.validate({ type: 'Polygon', coordinates: [[[181, 28], [182, 28], [182, 29], [181, 28]]] })).toThrow(BadRequestException);
  });

  it('uses the bundled PROJ database for EPSG lookup', () => {
    expect(gdal.SpatialReference.fromEPSG(4326).toProj4()).toContain('+proj=longlat');
  });
});
