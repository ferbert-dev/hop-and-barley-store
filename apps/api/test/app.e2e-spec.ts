import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureAppRouting } from './../src/app-routing';
import { configureOpenApi } from './../src/openapi';

jest.mock('./../src/database/prisma.service', () => ({
  PrismaService: class PrismaService {
    product = { findMany: jest.fn().mockResolvedValue([]) };
    $disconnect = jest.fn().mockResolvedValue(undefined);
    $queryRaw = jest.fn().mockResolvedValue([{ result: 1 }]);
  },
}));

describe('Platform API (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    configureAppRouting(app);
    configureOpenApi(app);
    await app.init();
  });

  it('GET / renders the backend service console', async () => {
    const server = app.getHttpServer() as App;

    const response = await request(server)
      .get('/')
      .expect('Content-Type', /html/)
      .expect(200);

    expect(response.text).toContain('Hop &amp; Barley API');
    expect(response.text).toContain('PostgreSQL');
    expect(response.text).toContain('Open Swagger UI');
  });

  it('GET /api/docs renders Swagger UI', async () => {
    const server = app.getHttpServer() as App;
    const response = await request(server).get('/api/docs').expect(200);

    expect(response.text).toContain('Swagger UI');
  });

  it('GET /api/v1/health/live returns the documented body', async () => {
    const server = app.getHttpServer() as App;
    const response = await request(server)
      .get('/api/v1/health/live')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it.each([
    ['/api/v1/health/ready', 200],
    ['/api/v1/products', 200],
  ] as const)('GET %s returns %i', async (path, status) => {
    const server = app.getHttpServer() as App;
    await request(server).get(path).expect(status);
  });

  afterAll(async () => {
    await app.close();
  });
});
