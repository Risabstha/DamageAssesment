import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import type { App } from 'supertest/types.js';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';
import { AnalysisService } from '../src/watershed/analysis.service.js';
import { HydrologyStationsService } from '../src/watershed/hydrology-stations.service.js';

describe('watershed reports', () => {
  let app: INestApplication<App>;
  const previousDbPath = process.env.WATERSHED_DB_PATH;
  const geometry = { type: 'Polygon', coordinates: [[[83, 28], [83.01, 28], [83.01, 28.01], [83, 28]]] };

  beforeAll(async () => {
    process.env.WATERSHED_DB_PATH = ':memory:';
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AnalysisService)
      .useValue({
        validate: () => ({ toJSON: () => JSON.stringify(geometry) }),
        analyze: () => ({ area_km2: 1.25, population: { total: 10 }, buildings: { total: 2 }, wards: { ward_count: 1 }, lulc: [] }),
      })
      .overrideProvider(HydrologyStationsService)
      .useValue({ getStations: () => ({ stations: [], failed_station_ids: [] }) })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
    if (previousDbPath === undefined) delete process.env.WATERSHED_DB_PATH;
    else process.env.WATERSHED_DB_PATH = previousDbPath;
  });

  it('keeps anonymous analyses unsaved and isolates saved reports between accounts', async () => {
    const anonymous = await request(app.getHttpServer()).post('/api/watershed/analyze').send({ geometry }).expect(201);
    expect(anonymous.body.report_id).toBeNull();
    await request(app.getHttpServer()).get('/api/watershed/history').expect(401);

    const alice = request.agent(app.getHttpServer());
    await alice.post('/api/auth/register').send({ username: 'alice', password: 'password123' }).expect(201);
    const saved = await alice.post('/api/watershed/analyze').send({ geometry, name: 'My watershed' }).expect(201);
    const id = saved.body.report_id as number;
    expect(id).toBeGreaterThan(0);
    const history = await alice.get('/api/watershed/history').expect(200);
    expect(history.body.reports).toHaveLength(1);
    await alice.post(`/api/watershed/report/${id}/rename`).send({ name: 'Renamed' }).expect(201);
    const detail = await alice.get(`/api/watershed/report/${id}`).expect(200);
    expect(detail.body.name).toBe('Renamed');
    expect(detail.body.geometry).toEqual(geometry);

    const bob = request.agent(app.getHttpServer());
    await bob.post('/api/auth/register').send({ username: 'bobby', password: 'password123' }).expect(201);
    await bob.get(`/api/watershed/report/${id}`).expect(404);
    await bob.delete(`/api/watershed/report/${id}`).expect(404);
    await alice.delete(`/api/watershed/report/${id}`).expect(200);
    await alice.get(`/api/watershed/report/${id}`).expect(404);
    await alice.post('/api/auth/logout').expect(201);
    await alice.get('/api/watershed/history').expect(401);
    await alice.post('/api/auth/login').send({ username: 'alice', password: 'wrongpass' }).expect(401);
    await alice.post('/api/auth/login').send({ username: 'alice', password: 'password123' }).expect(201);
  });

  it('rejects invalid river bounds through the API', async () => {
    await request(app.getHttpServer()).get('/api/watershed/river-streams').query({ bbox: '1,0,0,1' }).expect(400);
    await request(app.getHttpServer()).get('/api/watershed/river-streams/1/buffer').query({ distance: '10' }).expect(400);
  });

  it('serves hydrology station data', async () => {
    const response = await request(app.getHttpServer()).get('/api/watershed/hydrology-stations').expect('Cache-Control', 'no-store').expect(200);
    expect(response.body).toEqual({ stations: [], failed_station_ids: [] });
  });
});
