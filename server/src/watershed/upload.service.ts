import { BadRequestException, Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';
import gdal from './gdal.js';
import type { Geometry } from 'gdal-async';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, extname, join, posix } from 'node:path';
import { AnalysisService } from './analysis.service.js';

@Injectable()
export class UploadService {
  constructor(private readonly analysis: AnalysisService) {}

  parse(file: Express.Multer.File) {
    if (/\.(geojson|json)$/i.test(file.originalname)) {
      try { return this.analysis.validate(JSON.parse(file.buffer.toString('utf8')) as unknown); }
      catch (error) {
        if (error instanceof BadRequestException) throw error;
        throw new BadRequestException('File is not valid GeoJSON.');
      }
    }
    if (!/\.zip$/i.test(file.originalname)) throw new BadRequestException('Upload GeoJSON or a zipped shapefile.');
    let zip: AdmZip;
    try { zip = new AdmZip(file.buffer); }
    catch { throw new BadRequestException('Invalid ZIP archive.'); }
    let entries: AdmZip.IZipEntry[];
    try { entries = zip.getEntries(); }
    catch { throw new BadRequestException('Invalid ZIP archive.'); }
    if (entries.length > 1000 || entries.some(entry => entry.header.size > 100 * 1024 * 1024 || (entry.header.size === 0 && entry.header.compressedSize > 0))
      || entries.reduce((sum, entry) => sum + entry.header.size, 0) > 100 * 1024 * 1024)
      throw new BadRequestException('Archive exceeds the 100 MB unpacked size limit.');
    const shp = entries.find(entry => !entry.isDirectory && /\.shp$/i.test(entry.entryName));
    if (!shp) throw new BadRequestException('No shapefile found in ZIP archive.');
    const stem = posix.basename(shp.entryName, posix.extname(shp.entryName)).toLowerCase();
    const parts = new Map<string, Buffer>();
    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const base = posix.basename(entry.entryName);
      const ext = extname(base).toLowerCase();
      if (basename(base, extname(base)).toLowerCase() !== stem || !['.shp', '.shx', '.dbf', '.prj', '.cpg'].includes(ext)) continue;
      if (parts.has(ext)) throw new BadRequestException('Duplicate shapefile component in ZIP.');
      try { parts.set(ext, entry.getData()); }
      catch { throw new BadRequestException('Could not decompress shapefile component.'); }
    }
    const shpData = parts.get('.shp');
    if (!shpData) throw new BadRequestException('Missing shapefile.');
    if (!parts.has('.shx')) parts.set('.shx', this.makeIndex(shpData));
    const temp = mkdtempSync(join(tmpdir(), 'watershed-'));
    const files: string[] = [];
    try {
      for (const [ext, contents] of parts) {
        const path = join(temp, `layer${ext}`);
        writeFileSync(path, contents); files.push(path);
      }
      const dataset = gdal.open(join(temp, 'layer.shp'));
      try {
        const layer = dataset.layers.get(0);
        let union: Geometry | null = null;
        for (const feature of layer.features) {
          const geometry = feature.getGeometry();
          if (!geometry) continue;
          union = union ? union.union(geometry) : geometry.clone();
        }
        if (!union) throw new BadRequestException('Shapefile contains no geometry.');
        if (layer.srs) {
          union.srs = layer.srs;
          union.transformTo(gdal.SpatialReference.fromProj4('+proj=longlat +datum=WGS84 +no_defs'));
        }
        return this.analysis.validate(JSON.parse(union.toJSON()) as unknown);
      } finally { dataset.close(); }
    } catch (error) {
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Could not read the shapefile or its projection.');
    } finally {
      for (const path of files) unlinkSync(path);
      rmdirSync(temp);
    }
  }

  private makeIndex(shp: Buffer) {
    if (shp.length < 100) throw new BadRequestException('Invalid shapefile header.');
    const entries: [number, number][] = [];
    let offset = 100;
    while (offset < shp.length) {
      if (offset + 8 > shp.length) throw new BadRequestException('Invalid shapefile record.');
      const words = shp.readInt32BE(offset + 4);
      if (words < 0 || offset + 8 + words * 2 > shp.length) throw new BadRequestException('Invalid shapefile record.');
      entries.push([offset / 2, words]);
      offset += 8 + words * 2;
    }
    const index = Buffer.alloc(100 + entries.length * 8);
    shp.copy(index, 0, 0, 100);
    index.writeInt32BE(index.length / 2, 24);
    entries.forEach(([position, size], i) => { index.writeInt32BE(position, 100 + i * 8); index.writeInt32BE(size, 104 + i * 8); });
    return index;
  }
}
