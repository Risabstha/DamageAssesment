import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  NotFoundException,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request } from 'express';
import { AuthService } from '../auth/auth.service.js';
import { AnalysisService } from './analysis.service.js';
import { UploadService } from './upload.service.js';
import { RiverStreamsService } from './river-streams.service.js';
import { HydrologyStationsService } from './hydrology-stations.service.js';

type ReportRow = {
  id: number;
  name: string;
  geometry: string;
  results: string;
  area_km2: number;
  created_at: string;
};

@Controller('api/watershed')
export class WatershedController {
  constructor(
    private readonly analysis: AnalysisService,
    private readonly upload: UploadService,
    private readonly auth: AuthService,
    private readonly riverStreams: RiverStreamsService,
    private readonly hydrologyStations: HydrologyStationsService,
  ) {}

  @Get('hydrology-stations')
  @Header('Cache-Control', 'no-store')
  stations() {
    return this.hydrologyStations.getStations();
  }

  @Get('river-streams')
  streams(@Query('bbox') bbox: unknown) {
    return this.riverStreams.getStreams(bbox);
  }

  @Get('river-streams/:id/buffer')
  streamBuffer(@Param('id', ParseIntPipe) id: number, @Query('distance') distance: unknown) {
    return this.riverStreams.getBuffer(id, distance);
  }

  @Post('analyze')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }),
  )
  analyze(
    @Body() body: unknown,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
  ) {
    if (!body || typeof body !== 'object')
      throw new BadRequestException('Missing request body.');
    const name =
      'name' in body && typeof body.name === 'string'
        ? body.name.trim().slice(0, 200)
        : '';
    const geometry = file
      ? this.upload.parse(file)
      : this.analysis.validate('geometry' in body ? body.geometry : undefined);
    const results = this.analysis.analyze(geometry);
    const geojson: unknown = JSON.parse(geometry.toJSON());
    const user = this.auth.current(req);
    let report_id: number | null = null;
    if (user) {
      const result = this.auth.db
        .prepare(
          'INSERT INTO reports (user_id, name, geometry, results, area_km2) VALUES (?, ?, ?, ?, ?)',
        )
        .run(
          user.id,
          name,
          JSON.stringify(geojson),
          JSON.stringify(results),
          results.area_km2,
        );
      report_id = Number(result.lastInsertRowid);
    }
    return { success: true, report_id, geometry: geojson, results };
  }

  @Get('history')
  history(@Req() req: Request) {
    const user = this.auth.requireUser(req);
    const reports = this.auth.db
      .prepare(
        "SELECT id, CASE WHEN name = '' THEN 'Report #' || id ELSE name END AS name, area_km2, created_at FROM reports WHERE user_id = ? ORDER BY id DESC LIMIT 20",
      )
      .all(user.id);
    return { reports };
  }

  @Get('report/:id')
  detail(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = this.auth.requireUser(req);
    const row = this.auth.db
      .prepare('SELECT * FROM reports WHERE id = ? AND user_id = ?')
      .get(id, user.id) as ReportRow | undefined;
    if (!row) throw new NotFoundException('Report not found.');
    return {
      ...row,
      name: row.name || `Report #${row.id}`,
      geometry: JSON.parse(row.geometry) as unknown,
      results: JSON.parse(row.results) as unknown,
    };
  }

  @Delete('report/:id')
  delete(@Req() req: Request, @Param('id', ParseIntPipe) id: number) {
    const user = this.auth.requireUser(req);
    const result = this.auth.db
      .prepare('DELETE FROM reports WHERE id = ? AND user_id = ?')
      .run(id, user.id);
    if (!result.changes) throw new NotFoundException('Report not found.');
    return { success: true };
  }

  @Post('report/:id/rename')
  rename(
    @Req() req: Request,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
  ) {
    const user = this.auth.requireUser(req);
    if (
      !body ||
      typeof body !== 'object' ||
      !('name' in body) ||
      typeof body.name !== 'string'
    )
      throw new BadRequestException('A report name is required.');
    const name = body.name.trim().slice(0, 200);
    const result = this.auth.db
      .prepare('UPDATE reports SET name = ? WHERE id = ? AND user_id = ?')
      .run(name, id, user.id);
    if (!result.changes) throw new NotFoundException('Report not found.');
    return { success: true, name: name || `Report #${id}` };
  }
}
