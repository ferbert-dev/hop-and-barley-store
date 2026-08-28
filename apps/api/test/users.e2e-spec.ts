import { type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { configureAppRouting } from '../src/app-routing';
import { configureAppValidation } from '../src/app-validation';
import {
  SessionService,
  type ActiveSession,
} from '../src/auth/session/session.service';
import { UsersService } from '../src/users/users.service';

const USER_ID = '10000000-0000-4000-8000-000000000001';
const OTHER_USER_ID = '10000000-0000-4000-8000-000000000002';
const ACTIVE_TOKEN = 'A'.repeat(43);
const REVOKED_TOKEN = 'B'.repeat(43);
const COOKIE = `hb_session=${ACTIVE_TOKEN}`;

describe('Users self-resource API', () => {
  let app: INestApplication;
  const profile = {
    email: 'brewer@example.com',
    primaryAddress: null,
    profile: null,
    role: 'CUSTOMER' as const,
  };
  const users = {
    deleteAvatar: jest.fn().mockResolvedValue(undefined),
    getCurrent: jest.fn().mockResolvedValue(profile),
    readAvatar: jest.fn().mockResolvedValue({
      bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      contentType: 'image/png',
      sizeBytes: 8,
    }),
    saveAvatar: jest.fn().mockResolvedValue({
      contentType: 'image/png',
      sizeBytes: 8,
      updatedAt: '2026-08-28T12:00:00.000Z',
    }),
    updateCurrent: jest.fn().mockResolvedValue(profile),
  };
  const sessions = {
    authenticate: jest.fn((rawToken: string) =>
      Promise.resolve(rawToken === ACTIVE_TOKEN ? activeSession() : null),
    ),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(UsersService)
      .useValue(users)
      .overrideProvider(SessionService)
      .useValue(sessions)
      .compile();
    app = module.createNestApplication();
    configureAppRouting(app);
    configureAppValidation(app);
    await app.init();
  });

  beforeEach(() => jest.clearAllMocks());

  afterAll(async () => app.close());

  it('requires a current non-revoked session and always returns private no-store', async () => {
    const server = app.getHttpServer() as App;
    for (const response of [
      await request(server).get('/api/v1/users/me').expect(401),
      await request(server)
        .get('/api/v1/users/me')
        .set('Cookie', `hb_session=${REVOKED_TOKEN}`)
        .expect(401),
    ]) {
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers.vary).toBe('Cookie, Origin');
    }
    expect(users.getCurrent).not.toHaveBeenCalled();
  });

  it('derives identity only from the session and exposes no arbitrary user-id route', async () => {
    const server = app.getHttpServer() as App;
    const response = await request(server)
      .get('/api/v1/users/me')
      .set('Cookie', COOKIE)
      .expect(200);

    expect(response.body).toEqual(profile);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(users.getCurrent).toHaveBeenCalledWith(USER_ID);
    await request(server)
      .get(`/api/v1/users/${OTHER_USER_ID}`)
      .set('Cookie', COOKIE)
      .expect(404);
  });

  it.each(['role', 'status', 'password', 'sessionId', 'userId'])(
    'rejects writable %s before the service runs',
    async (field) => {
      const csrf = await csrfToken();
      await request(app.getHttpServer() as App)
        .patch('/api/v1/users/me')
        .set('Cookie', COOKIE)
        .set('Origin', 'http://localhost:3000')
        .set('X-CSRF-Token', csrf)
        .send({ [field]: field === 'userId' ? OTHER_USER_ID : 'ADMIN' })
        .expect(400);
      expect(users.updateCurrent).not.toHaveBeenCalled();
    },
  );

  it('requires exact Origin and session-bound CSRF before profile mutation', async () => {
    const server = app.getHttpServer() as App;
    await request(server)
      .patch('/api/v1/users/me')
      .set('Cookie', COOKIE)
      .send({ profile: { fullName: 'Brew Master' } })
      .expect(403);
    await request(server)
      .patch('/api/v1/users/me')
      .set('Cookie', COOKIE)
      .set('Origin', 'http://evil.example')
      .set('X-CSRF-Token', await csrfToken())
      .send({ profile: { fullName: 'Brew Master' } })
      .expect(403);
    expect(users.updateCurrent).not.toHaveBeenCalled();
  });

  it('passes an allow-listed update and exact phone bytes under the session identity', async () => {
    const csrf = await csrfToken();
    await request(app.getHttpServer() as App)
      .patch('/api/v1/users/me')
      .set('Cookie', COOKIE)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .send({
        email: 'Brew.Master@example.com',
        primaryAddress: { city: 'Madrid' },
        profile: { phone: '  +49 123  ' },
      })
      .expect(200);
    expect(users.updateCurrent).toHaveBeenCalledWith(USER_ID, {
      email: 'Brew.Master@example.com',
      primaryAddress: { city: 'Madrid' },
      profile: { phone: '  +49 123  ' },
    });
  });

  it('wires guarded multipart upload, private byte read and idempotent delete', async () => {
    const server = app.getHttpServer() as App;
    const csrf = await csrfToken();
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await request(server)
      .put('/api/v1/users/me/avatar')
      .set('Cookie', COOKIE)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .attach('file', bytes, {
        contentType: 'image/png',
        filename: 'avatar.png',
      })
      .expect(200);
    expect(users.saveAvatar).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({
        buffer: bytes,
        mimetype: 'image/png',
        size: bytes.length,
      }),
    );

    const read = await request(server)
      .get('/api/v1/users/me/avatar')
      .set('Cookie', COOKIE)
      .expect('Content-Type', 'image/png')
      .expect(200);
    expect(read.body).toEqual(bytes);
    expect(read.headers['cache-control']).toBe('private, no-store');
    expect(read.headers['x-content-type-options']).toBe('nosniff');

    await request(server)
      .delete('/api/v1/users/me/avatar')
      .set('Cookie', COOKIE)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrf)
      .expect(204);
    expect(users.deleteAvatar).toHaveBeenCalledWith(USER_ID);
  });

  it('rejects an oversized multipart avatar before storage', async () => {
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1);
    oversized.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    await request(app.getHttpServer() as App)
      .put('/api/v1/users/me/avatar')
      .set('Cookie', COOKIE)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', await csrfToken())
      .attach('file', oversized, {
        contentType: 'image/png',
        filename: 'oversized.png',
      })
      .expect(413);
    expect(users.saveAvatar).not.toHaveBeenCalled();
  });

  async function csrfToken(): Promise<string> {
    const response = await request(app.getHttpServer() as App)
      .get('/api/v1/auth/csrf')
      .set('Cookie', COOKIE)
      .expect(200);
    return (response.body as { csrfToken: string }).csrfToken;
  }
});

function activeSession(): ActiveSession {
  return {
    expiresAt: new Date('2026-09-28T12:00:00.000Z'),
    issuedAt: new Date('2026-08-28T12:00:00.000Z'),
    lastSeenAt: new Date('2026-08-28T12:00:00.000Z'),
    rawToken: ACTIVE_TOKEN,
    role: 'CUSTOMER',
    sessionId: '20000000-0000-4000-8000-000000000001',
    userId: USER_ID,
  };
}
