import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { HydrologyStationsService } from '../src/watershed/hydrology-stations.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const previousDbPath = process.env.WATERSHED_DB_PATH;

  beforeEach(async () => {
    process.env.WATERSHED_DB_PATH = ':memory:';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).overrideProvider(HydrologyStationsService).useValue({ getStations: () => ({ stations: [], failed_station_ids: [] }) }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
    if (previousDbPath === undefined) delete process.env.WATERSHED_DB_PATH;
    else process.env.WATERSHED_DB_PATH = previousDbPath;
  });
});


