import { mkdtemp, readFile, rmdir, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { HydrologyStationsService, parsePointTable, parseStationPage } from './hydrology-stations.service.js';

const ids = [5047, 5080, 260, 262];
const stationPage = (id: number, district = 'Kathmandu') => {
  const data = {
    id, name: "Dhobi Khola at O'Brien", latitude: 27.7, longitude: 85.3,
    elevation: id === 260 ? null : 1316, district, description: 'Station, "main"',
  };
  return `<script>var river = ${JSON.stringify(JSON.stringify(data))};</script>
    <form id="SeriesId_Data">
      <input name="csrf_test_name" value="test-token">
      <input name="date" value="2026-01-01">
      <input name="seriesid" value="${id}">
      <select name="period"><option value="1">Point</option></select>
    </form>`;
};
const pointTable = (value: string) => `<table id="tablegeneral"><thead><tr><th>Date</th><th>Point</th></tr></thead>
  <tbody><tr><td>Tue, Jan 01, 2026 ,02:10</td><td>${value}</td></tr><tr><td>Older</td><td>99</td></tr></tbody></table>`;

describe('hydrology stations', () => {
  let directory: string;
  const previous = process.env.HYDROLOGY_STATIONS_CSV;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'hydrology-stations-'));
    process.env.HYDROLOGY_STATIONS_CSV = join(directory, 'stations.csv');
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    try { await unlink(join(directory, 'stations.csv')); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
    }
    await rmdir(directory);
    if (previous === undefined) delete process.env.HYDROLOGY_STATIONS_CSV;
    else process.env.HYDROLOGY_STATIONS_CSV = previous;
  });

  it('extracts structured metadata without executing page scripts', () => {
    expect(parseStationPage(stationPage(260), 260, '2026-01-01T00:00:00.000Z')).toMatchObject({
      station_name: "Dhobi Khola at O'Brien", river_name: 'Dhobi Khola',
      latitude: 27.7, longitude: 85.3, elevation: null, district: 'Kathmandu', description: 'Station, "main"',
    });
    expect(() => parseStationPage(stationPage(260), 262, '2026-01-01T00:00:00.000Z')).toThrow();
    expect(() => parseStationPage(stationPage(260).replace('27.7', '280'), 260, '2026-01-01T00:00:00.000Z')).toThrow();
    expect(() => parseStationPage('<script>var river = alert(1)</script>', 260, '2026-01-01T00:00:00.000Z')).toThrow();
    expect(() => parseStationPage('no station', 260, '2026-01-01T00:00:00.000Z')).toThrow();
  });

  it('reads the newest point row, including zero and missing observations', () => {
    expect(parsePointTable(pointTable('0'))).toEqual({ point_value: 0, point_observed_at: 'Tue, Jan 01, 2026 ,02:10' });
    expect(parsePointTable('<table id="tablegeneral"><thead><tr><th>Date</th><th>Point</th></tr></thead><tbody></tbody></table>'))
      .toEqual({ point_value: null, point_observed_at: null });
    expect(() => parsePointTable(pointTable('invalid'))).toThrow();
    expect(() => parsePointTable('<table><tr><td>0.63</td></tr></table>')).toThrow();
  });

  it('writes the latest CSV, preserves failed stations and restores it on restart', async () => {
    let failed = false;
    let failAll = false;
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const address = typeof url === 'string' ? url : url instanceof URL ? url.href : url.url;
      if (init?.method === 'POST') {
        expect(init.body).toBeInstanceOf(URLSearchParams);
        const body = init.body as URLSearchParams;
        expect(body.get('period')).toBe('1');
        expect(new Headers(init.headers).get('cookie')).toContain('csrf_cookie_name=test');
        if (failed && body.get('seriesid') === '260') return new Response('', { status: 503 });
        return Response.json({ status: 'success', data: { table: pointTable(body.get('seriesid') === '260' ? '0' : '1.23') } });
      }
      const id = Number(address.split('/').pop());
      const unavailable = failAll;
      return new Response(unavailable ? 'unavailable' : stationPage(id, failed ? 'Updated' : 'Kathmandu'), {
        status: unavailable ? 503 : 200,
        headers: { 'Set-Cookie': 'csrf_cookie_name=test; Path=/' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new HydrologyStationsService();
    expect(() => service.getStations()).toThrow(ServiceUnavailableException);
    await service.refresh();
    expect(service.getStations().stations).toHaveLength(4);
    expect(service.getStations().stations.find(station => station.id === 260)).toMatchObject({
      elevation: null, point_value: 0, point_observed_at: 'Tue, Jan 01, 2026 ,02:10',
    });
    expect(fetchMock).toHaveBeenCalledTimes(8);
    failed = true;
    await service.refresh();
    const result = service.getStations();
    expect(result.failed_station_ids).toEqual([260]);
    expect(result.stations.find(station => station.id === 260)?.district).toBe('Kathmandu');
    expect(result.stations.find(station => station.id === 260)?.point_value).toBe(0);
    expect(result.stations.find(station => station.id === 5047)?.district).toBe('Updated');
    const csv = await readFile(join(directory, 'stations.csv'), 'utf8');
    expect(csv).toContain('"Station, ""main"""');
    expect(csv).toContain('"Tue, Jan 01, 2026 ,02:10"');
    expect(csv.trim().split('\n')).toHaveLength(5);
    failAll = true;
    await service.refresh();
    expect(service.getStations().failed_station_ids).toEqual(ids);
    expect(await readFile(join(directory, 'stations.csv'), 'utf8')).toBe(csv);

    const restored = new HydrologyStationsService();
    const interval = vi.spyOn(globalThis, 'setInterval');
    failed = false;
    failAll = false;
    await restored.onModuleInit();
    expect(interval).toHaveBeenCalledWith(expect.any(Function), 600_000);
    expect(restored.getStations().stations.map(station => station.id)).toEqual(ids);
    expect(restored.getStations().stations.find(station => station.id === 260)?.point_value).toBe(0);
    await vi.waitFor(() => expect(restored.getStations().stations.find(station => station.id === 5047)?.district).toBe('Kathmandu'));
    const callback = interval.mock.calls.at(-1)?.[0];
    expect(typeof callback).toBe('function');
    if (typeof callback === 'function') callback();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(36));
    restored.onModuleDestroy();
    service.onModuleDestroy();
  });

  it('loads the previous CSV format without point columns', async () => {
    await writeFile(join(directory, 'stations.csv'),
      'id,station_name,river_name,latitude,longitude,elevation,district,description,fetched_at\n'
      + '260,Station,River,27.7,85.3,,Kathmandu,Station,2026-01-01T00:00:00.000Z\n');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const service = new HydrologyStationsService();
    await service.onModuleInit();
    expect(service.getStations().stations[0]).toMatchObject({ point_value: null, point_observed_at: null });
    service.onModuleDestroy();
  });
});
