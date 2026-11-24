import { BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { existsSync, mkdtempSync, readFileSync, rmdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Readable } from 'node:stream';
import gdal from './gdal.js';
import { AnalysisService } from './analysis.service.js';
import { UploadService } from './upload.service.js';

function uploaded(buffer: Buffer, originalname: string): Express.Multer.File {
  return { buffer, originalname, fieldname: 'file', encoding: '7bit', mimetype: 'application/zip',
    size: buffer.length, stream: Readable.from([]), destination: '', filename: '', path: '' };
}

describe('boundary uploads', () => {
  const service = new UploadService(new AnalysisService());

  it('reprojects zipped shapefiles and rebuilds a missing index', () => {
    const folder = mkdtempSync(join(tmpdir(), 'watershed-test-'));
    const path = join(folder, 'layer.shp');
    const names = ['layer.shp', 'layer.shx', 'layer.dbf', 'layer.prj'];
    try {
      const dataset = gdal.drivers.get('ESRI Shapefile').create(path);
      const projection = gdal.SpatialReference.fromProj4('+proj=utm +zone=44 +datum=WGS84 +units=m +no_defs');
      const layer = dataset.layers.create('layer', projection, gdal.Polygon);
      const geometry = gdal.Geometry.fromGeoJson({ type: 'Polygon', coordinates: [[[83.45, 28.26], [83.46, 28.26], [83.46, 28.27], [83.45, 28.27], [83.45, 28.26]]] });
      geometry.srs = gdal.SpatialReference.fromProj4('+proj=longlat +datum=WGS84 +no_defs');
      geometry.transformTo(projection);
      const feature = new gdal.Feature(layer);
      feature.setGeometry(geometry); layer.features.add(feature);
      dataset.close();

      const archive = new AdmZip();
      for (const name of names.filter(name => !name.endsWith('.shx'))) archive.addFile(name, readFileSync(join(folder, name)));
      const result = service.parse(uploaded(archive.toBuffer(), 'boundary.zip'));
      expect(result.getEnvelope().minX).toBeCloseTo(83.45, 4);
      expect(result.getEnvelope().maxY).toBeCloseTo(28.27, 4);
    } finally {
      for (const name of names) if (existsSync(join(folder, name))) unlinkSync(join(folder, name));
      rmdirSync(folder);
    }
  });

  it('rejects invalid archives', () => {
    expect(() => service.parse(uploaded(Buffer.from('not a zip'), 'boundary.zip'))).toThrow(BadRequestException);
  });
});
