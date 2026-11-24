import { Injectable, Logger, ServiceUnavailableException, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { parseExpressionAt } from 'acorn';
import { load } from 'cheerio';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const STATION_IDS = [5047, 5080, 260, 262] as const;
const REFRESH_INTERVAL = 10 * 60 * 1000;
const CSV_COLUMNS = ['id', 'station_name', 'river_name', 'latitude', 'longitude', 'elevation', 'point_value', 'point_observed_at', 'district', 'description', 'fetched_at'] as const;

export type HydrologyStation = {
  id: number;
  station_name: string;
  river_name: string | null;
  latitude: number;
  longitude: number;
  elevation: number | null;
  point_value: number | null;
  point_observed_at: string | null;
  district: string | null;
  description: string | null;
  fetched_at: string;
};

function nullableText(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error(`Invalid ${field}.`);
  return value.trim() || null;
}

function numberField(value: unknown, field: string): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || String(value).trim() === '')
    throw new Error(`Missing ${field}.`);
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Invalid ${field}.`);
  return number;
}

function validateStation(value: Record<string, unknown>, id: number, fetchedAt: string): HydrologyStation {
  const stationName = nullableText(value.station_name, 'station name');
  const latitude = numberField(value.latitude, 'latitude');
  const longitude = numberField(value.longitude, 'longitude');
  const elevation = value.elevation === null || value.elevation === undefined || value.elevation === ''
    ? null : numberField(value.elevation, 'elevation');
  const pointValue = value.point_value === null || value.point_value === undefined || value.point_value === ''
    ? null : numberField(value.point_value, 'point value');
  const pointObservedAt = nullableText(value.point_observed_at, 'point observation time');
  if (!stationName || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180
    || !Number.isFinite(Date.parse(fetchedAt)) || (pointValue === null) !== (pointObservedAt === null))
    throw new Error('Invalid station metadata.');
  return {
    id, station_name: stationName, river_name: nullableText(value.river_name, 'river name'),
    latitude, longitude, elevation, point_value: pointValue, point_observed_at: pointObservedAt,
    district: nullableText(value.district, 'district'),
    description: nullableText(value.description, 'description'), fetched_at: fetchedAt,
  };
}

export function parseStationPage(html: string, id: number, fetchedAt: string): HydrologyStation {
  const assignment = /\bvar\s+river\s*=\s*/.exec(html);
  if (!assignment) throw new Error('Station metadata was not found in the page.');
  const expression = parseExpressionAt(html, assignment.index + assignment[0].length, { ecmaVersion: 'latest' });
  if (expression.type !== 'Literal' || typeof expression.value !== 'string') throw new Error('Invalid station metadata literal.');
  const raw: unknown = JSON.parse(expression.value);
  if (!raw || typeof raw !== 'object' || !('id' in raw) || raw.id !== id || !('name' in raw) || typeof raw.name !== 'string')
    throw new Error('Station metadata does not match the requested station.');
  const source = raw as Record<string, unknown>;
  const separator = raw.name.search(/\s+at\s+/i);
  return validateStation({
    station_name: raw.name, river_name: separator === -1 ? null : raw.name.slice(0, separator),
    latitude: source.latitude, longitude: source.longitude, elevation: source.elevation,
    district: source.district, description: source.description,
  }, id, fetchedAt);
}

export function parsePointTable(html: string): { point_value: number | null; point_observed_at: string | null } {
  const $ = load(html);
  const table = $('table#tablegeneral');
  const headings = table.find('thead th').map((_, element) => $(element).text().trim()).get();
  if (headings.length !== 2 || headings[0] !== 'Date' || headings[1] !== 'Point')
    throw new Error('Unexpected point observation table.');
  const row = table.find('tbody tr').first();
  if (!row.length) return { point_value: null, point_observed_at: null };
  const cells = row.find('td').map((_, element) => $(element).text().replace(/\s+/g, ' ').trim()).get();
  if (cells.length === 1 && /no (data|observations?)/i.test(cells[0]))
    return { point_value: null, point_observed_at: null };
  if (cells.length !== 2 || !cells[0]) throw new Error('Invalid point observation row.');
  return { point_value: numberField(cells[1], 'point value'), point_observed_at: cells[0] };
}

@Injectable()
export class HydrologyStationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HydrologyStationsService.name);
  private readonly csvPath = resolve(process.env.HYDROLOGY_STATIONS_CSV || 'data/hydrology-stations.csv');
  private readonly shutdown = new AbortController();
  private stations = new Map<number, HydrologyStation>();
  private failures: number[] = [];
  private interval: ReturnType<typeof setInterval> | null = null;
  private running = false;

  async onModuleInit() {
    try {
      const csv = await readFile(this.csvPath, 'utf8');
      const records: Record<string, string>[] = parse(csv, { columns: true, skip_empty_lines: true });
      for (const record of records) {
        const id = numberField(record.id, 'station id');
        if (!STATION_IDS.some(known => known === id) || this.stations.has(id))
          throw new Error(`Unexpected or duplicate station id ${id}.`);
        this.stations.set(id, validateStation(record, id, record.fetched_at));
      }
    } catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        this.stations.clear();
        this.logger.error('Could not read the hydrology station CSV', error instanceof Error ? error.stack : String(error));
      }
    }
    void this.refresh();
    this.interval = setInterval(() => { void this.refresh(); }, REFRESH_INTERVAL);
  }

  onModuleDestroy() {
    this.shutdown.abort();
    if (this.interval) clearInterval(this.interval);
  }

  getStations() {
    if (!this.stations.size) throw new ServiceUnavailableException('Hydrology station data is not available yet.');
    return {
      stations: STATION_IDS.flatMap(id => {
        const station = this.stations.get(id);
        return station ? [station] : [];
      }),
      failed_station_ids: this.failures,
    };
  }

  async refresh() {
    if (this.running || this.shutdown.signal.aborted) return;
    this.running = true;
    try {
      const results = await Promise.all(STATION_IDS.map(async id => {
        try {
          const response = await fetch(`https://dhm.gov.np/hydrology/hms-Single/${id}`, {
            signal: AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(15_000)]),
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const html = await response.text();
          const station = parseStationPage(html, id, new Date().toISOString());
          const point = await this.fetchPoint(html, response, id);
          return { id, station: { ...station, ...point } };
        } catch (error) {
          if (!this.shutdown.signal.aborted)
            this.logger.error(`Could not refresh hydrology station ${id}`, error instanceof Error ? error.message : String(error));
          return { id, station: null };
        }
      }));
      if (this.shutdown.signal.aborted) return;
      this.failures = results.filter(result => !result.station).map(result => result.id);
      const next = new Map(this.stations);
      for (const result of results) if (result.station) next.set(result.id, result.station);
      if (results.some(result => result.station)) {
        try {
          await this.writeCsv(next);
          this.stations = next;
        } catch (error) {
          this.failures = [...STATION_IDS];
          this.logger.error('Could not save hydrology station CSV', error instanceof Error ? error.stack : String(error));
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async fetchPoint(html: string, pageResponse: Response, id: number) {
    const $ = load(html);
    const form = $('#SeriesId_Data');
    const token = form.find('input[name="csrf_test_name"]').val();
    const date = form.find('input[name="date"]').val();
    const seriesId = form.find('input[name="seriesid"]').val();
    const cookies = pageResponse.headers.getSetCookie().map(cookie => cookie.split(';', 1)[0]).join('; ');
    if (typeof token !== 'string' || !token || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || typeof seriesId !== 'string' || !/^\d+$/.test(seriesId) || !cookies
      || !form.find('select[name="period"] option[value="1"]').length) {
      throw new Error('Missing point observation form or session.');
    }
    const response = await fetch('https://dhm.gov.np/site/getRiverWatchBySeriesId_Single', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: cookies,
        Referer: `https://dhm.gov.np/hydrology/hms-Single/${id}`,
      },
      body: new URLSearchParams({ csrf_test_name: token, date, period: '1', seriesid: seriesId }),
      signal: AbortSignal.any([this.shutdown.signal, AbortSignal.timeout(15_000)]),
    });
    if (!response.ok) throw new Error(`Point observations returned HTTP ${response.status}.`);
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('status' in result) || result.status !== 'success'
      || !('data' in result) || !result.data || typeof result.data !== 'object'
      || !('table' in result.data) || typeof result.data.table !== 'string')
      throw new Error('Invalid point observation response.');
    return parsePointTable(result.data.table);
  }

  private async writeCsv(stations: Map<number, HydrologyStation>) {
    await mkdir(dirname(this.csvPath), { recursive: true });
    const temporary = `${this.csvPath}.${randomUUID()}.tmp`;
    try {
      const rows = STATION_IDS.flatMap(id => {
        const station = stations.get(id);
        return station ? [station] : [];
      });
      await writeFile(temporary, stringify(rows, { header: true, columns: [...CSV_COLUMNS] }), 'utf8');
      await rename(temporary, this.csvPath);
    } catch (error) {
      try { await unlink(temporary); }
      catch (cleanupError) {
        if (!(cleanupError instanceof Error && 'code' in cleanupError && cleanupError.code === 'ENOENT'))
          this.logger.error('Could not remove temporary station CSV', cleanupError instanceof Error ? cleanupError.message : String(cleanupError));
      }
      throw error;
    }
  }
}
