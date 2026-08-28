import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureAppRouting } from './../src/app-routing';
import { configureAppValidation } from './../src/app-validation';
import type { CatalogResponseDto } from './../src/catalog/dto/catalog-response.dto';
import { PrismaService } from './../src/database/prisma.service';
import { configureOpenApi } from './../src/openapi';
import { LoginService } from './../src/auth/login.service';
import {
  SessionService,
  type ActiveSession,
} from './../src/auth/session/session.service';

type OpenApiSchema = {
  enum?: string[];
  format?: string;
  items?: { $ref?: string };
  maxLength?: number;
  maximum?: number;
  minimum?: number;
  pattern?: string;
  properties?: Record<string, OpenApiSchema & { $ref?: string }>;
  required?: string[];
  type?: string;
  writeOnly?: boolean;
};

type CatalogOpenApiDocument = {
  components: {
    schemas: Record<string, OpenApiSchema>;
  };
  paths: Record<
    string,
    {
      get: {
        parameters: Array<{
          name: string;
          required: boolean;
          schema: OpenApiSchema & { default?: number | string };
        }>;
        responses: Record<
          string,
          { content?: { 'application/json': { schema: { $ref: string } } } }
        >;
      };
    }
  >;
};

jest.mock('./../src/database/prisma.service', () => ({
  PrismaService: class PrismaService {
    category = {
      findMany: jest.fn().mockResolvedValue([{ name: 'Hops', slug: 'hops' }]),
    };
    product = {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: { where: { slug: string } }) =>
          where.slug === 'cascade-hops'
            ? Promise.resolve({
                amountUnit: 'MILLIGRAM',
                category: { name: 'Hops', slug: 'hops' },
                currency: 'USD',
                description: 'Bright whole-cone hops',
                id: '20000000-0000-4000-8000-000000000002',
                imagePath: '/assets/products/cascade-hops.webp',
                kitYieldVolumeMl: null,
                maximumOrderAmount: null,
                minimumOrderAmount: 100_000,
                name: 'Cascade Hops',
                orderStepAmount: 100_000,
                packageNetWeightMg: null,
                priceBasisAmount: 100_000,
                priceMinor: 699,
                priceQualifier: 'per 100g',
                saleKind: 'WEIGHT',
                slug: 'cascade-hops',
                specifications: [
                  { label: 'Origin', value: 'USA' },
                  { label: 'Uses', value: ['Late additions', 'Dry hopping'] },
                ],
                stockAmount: 100_000_000,
                teaser: 'Citrus and floral whole-cone hops.',
              })
            : Promise.resolve(null),
        ),
      findMany: jest.fn().mockResolvedValue([
        {
          amountUnit: 'MILLIGRAM',
          category: { name: 'Hops', slug: 'hops' },
          currency: 'USD',
          description: 'Bright whole-cone hops',
          id: '20000000-0000-4000-8000-000000000002',
          imagePath: '/assets/products/cascade-hops.webp',
          kitYieldVolumeMl: null,
          maximumOrderAmount: null,
          minimumOrderAmount: 100_000,
          name: 'Cascade Hops',
          orderStepAmount: 100_000,
          packageNetWeightMg: null,
          priceBasisAmount: 100_000,
          priceMinor: 699,
          priceQualifier: 'per 100g',
          saleKind: 'WEIGHT',
          slug: 'cascade-hops',
          stockAmount: 100_000_000,
          teaser: 'Citrus and floral whole-cone hops.',
        },
      ]),
    };
    user = {
      create: jest.fn().mockResolvedValue({ id: 'private-user-id' }),
    };
    $transaction = jest.fn(
      async (callback: (client: this) => Promise<unknown>) => callback(this),
    );
    $disconnect = jest.fn().mockResolvedValue(undefined);
    $queryRaw = jest.fn().mockResolvedValue([{ result: 1 }]);
  },
}));

jest.mock('./../src/auth/password/password-hash-executor', () => ({
  PasswordHashExecutor: class PasswordHashExecutor {
    hash = jest.fn().mockResolvedValue({
      algorithm: 'argon2id',
      hashLength: 32,
      memoryCost: 7_168,
      parallelism: 1,
      passwordHash: '$argon2id$v=19$m=7168,p=1,t=5$salt$hash',
      saltLength: 16,
      timeCost: 5,
      version: 19,
    });
  },
}));

describe('Platform API (e2e)', () => {
  let app: INestApplication;
  const activeSessions = new Map<string, ActiveSession>();
  const sessionService = {
    authenticate: jest.fn((rawToken: string) =>
      Promise.resolve(activeSessions.get(rawToken) ?? null),
    ),
    issue: jest.fn(
      (
        userId: string,
        presented: string | null,
        options: { rememberMe?: boolean } = {},
      ) => {
        if (presented) activeSessions.delete(presented);
        const rawToken = 'A'.repeat(43);
        const session: ActiveSession = {
          expiresAt: new Date(
            options.rememberMe
              ? '2026-09-21T10:00:00.000Z'
              : '2026-08-29T10:00:00.000Z',
          ),
          issuedAt: new Date('2026-08-22T10:00:00.000Z'),
          lastSeenAt: new Date('2026-08-22T10:00:00.000Z'),
          rawToken,
          role: 'CUSTOMER',
          sessionId: '20000000-0000-4000-8000-000000000001',
          status: 'ACTIVE',
          userId,
        };
        activeSessions.set(rawToken, session);
        return Promise.resolve(session);
      },
    ),
    revokeAll: jest.fn().mockResolvedValue(0),
    revokeCurrent: jest.fn((rawToken: string) => {
      const revoked = activeSessions.delete(rawToken);
      return Promise.resolve(revoked);
    }),
  };
  const loginService = {
    login: jest.fn(
      async (
        dto: { email: string; password: string; rememberMe: boolean },
        presented: string | null,
      ) => {
        if (
          dto.email.toLowerCase() !== 'brewer@example.com' ||
          dto.password !== 'correct-password-value'
        ) {
          throw new UnauthorizedException({ status: 'unauthorized' });
        }
        return sessionService.issue(
          '10000000-0000-4000-8000-000000000001',
          presented,
          { rememberMe: dto.rememberMe },
        );
      },
    ),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(SessionService)
      .useValue(sessionService)
      .overrideProvider(LoginService)
      .useValue(loginService)
      .compile();

    app = moduleFixture.createNestApplication();
    configureAppRouting(app);
    configureAppValidation(app);
    configureOpenApi(app);
    await app.init();
  });

  beforeEach(() => {
    activeSessions.clear();
    jest.clearAllMocks();
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

  it('POST /api/v1/auth/register returns only the generic private accepted contract', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .set('X-Request-Id', 'safe-request-1')
      .send({
        email: 'Brew.Master@example.com',
        password: 'Abcdefghi1!x',
      })
      .expect(202);

    expect(response.body).toEqual({ status: 'accepted' });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toBe('Cookie, Origin');
    expect(response.headers['x-request-id']).toBe('safe-request-1');
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toMatch(
      /email|role|user|hash|credential|cookie/i,
    );
  });

  it('returns the exact same 202 body for a canonical-email duplicate', async () => {
    const prisma = app.get(PrismaService);
    jest.spyOn(prisma.user, 'create').mockRejectedValueOnce({
      code: 'P2002',
      meta: { target: 'User_normalizedEmail_key' },
    });

    const response = await request(app.getHttpServer() as App)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: 'BREW.MASTER@example.com',
        password: 'Abcdefghi1!y',
      })
      .expect(202);

    expect(JSON.stringify(response.body)).toBe(
      JSON.stringify({ status: 'accepted' }),
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('rejects an unconfigured Origin and non-JSON media type before registration', async () => {
    const server = app.getHttpServer() as App;
    const invalidOrigin = await request(server)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://evil.example')
      .send({
        email: 'brew@example.com',
        password: 'Abcdefghi1!x',
      })
      .expect(403);
    const invalidMediaType = await request(server)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .set('Content-Type', 'text/plain')
      .send('not-json')
      .expect(415);

    for (const response of [invalidOrigin, invalidMediaType]) {
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers.vary).toBe('Cookie, Origin');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('runs login, current session, CSRF and logout through the guarded HTTP contract', async () => {
    const server = app.getHttpServer() as App;
    const login = await request(server)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .set('X-Request-Id', 'a1b-login-request')
      .send({
        email: 'brewer@example.com',
        password: 'correct-password-value',
      })
      .expect(200);

    expect(login.body).toEqual({
      absoluteExpiresAt: '2026-08-29T10:00:00.000Z',
      idleExpiresAt: '2026-08-23T10:00:00.000Z',
      issuedAt: '2026-08-22T10:00:00.000Z',
      user: {
        id: '10000000-0000-4000-8000-000000000001',
        role: 'CUSTOMER',
        status: 'ACTIVE',
      },
    });
    expect(login.headers['cache-control']).toBe('private, no-store');
    expect(login.headers.vary).toBe('Cookie, Origin');
    expect(login.headers['x-request-id']).toBe('a1b-login-request');
    const setCookie = login.headers['set-cookie']?.[0];
    expect(setCookie).toBeDefined();
    if (!setCookie) throw new Error('Expected a session cookie');
    expect(setCookie).toMatch(
      /^hb_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax$/,
    );
    expect(setCookie).not.toContain('Max-Age=');
    expect(setCookie).not.toContain('Expires=');
    expect(setCookie).not.toContain('Domain=');
    expect(setCookie).not.toContain('Secure');
    expect(JSON.stringify(login.body)).not.toMatch(/token|email|sessionId/i);
    const cookie = setCookie.split(';', 1)[0];

    const current = await request(server)
      .get('/api/v1/auth/session')
      .set('Cookie', cookie)
      .expect(200);
    expect(current.body).toEqual(login.body);
    expect(current.headers['cache-control']).toBe('private, no-store');

    const csrf = await request(server)
      .get('/api/v1/auth/csrf')
      .set('Cookie', cookie)
      .expect(200);
    const csrfBody = csrf.body as unknown as { csrfToken: string };
    expect(csrfBody.csrfToken).toMatch(/^test-v1\.[A-Za-z0-9_-]{43}$/);
    expect(csrf.headers['cache-control']).toBe('private, no-store');

    const logout = await request(server)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .set('X-CSRF-Token', csrfBody.csrfToken)
      .expect(200);
    expect(logout.body).toEqual({ status: 'signed-out' });
    expect(logout.headers['set-cookie']?.[0]).toBe(
      'hb_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax',
    );
    expect(logout.headers['cache-control']).toBe('private, no-store');

    await request(server)
      .get('/api/v1/auth/session')
      .set('Cookie', cookie)
      .expect(401);
  });

  it('derives an exact 30-day absolute session and persistent cookie only from remembered login', async () => {
    const server = app.getHttpServer() as App;
    const login = await request(server)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: 'brewer@example.com',
        password: 'correct-password-value',
        rememberMe: true,
      })
      .expect(200);

    expect(login.body).toMatchObject({
      absoluteExpiresAt: '2026-09-21T10:00:00.000Z',
      idleExpiresAt: '2026-08-23T10:00:00.000Z',
    });
    expect(login.headers['set-cookie']?.[0]).toMatch(
      /^hb_session=[A-Za-z0-9_-]{43}; Max-Age=2592000; Expires=Mon, 21 Sep 2026 10:00:00 GMT; Path=\/; HttpOnly; SameSite=Lax$/,
    );
    expect(sessionService.issue).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      null,
      { rememberMe: true },
    );
  });

  it('fails an invalid remember choice closed to the unchecked session policy', async () => {
    const server = app.getHttpServer() as App;
    const login = await request(server)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({
        email: 'brewer@example.com',
        password: 'correct-password-value',
        rememberMe: 'true',
      })
      .expect(200);

    expect(login.body).toMatchObject({
      absoluteExpiresAt: '2026-08-29T10:00:00.000Z',
    });
    expect(login.headers['set-cookie']?.[0]).toMatch(
      /^hb_session=[A-Za-z0-9_-]{43}; Path=\/; HttpOnly; SameSite=Lax$/,
    );
    expect(sessionService.issue).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      null,
      { rememberMe: false },
    );
  });

  it('returns byte-identical private 401 failures for unknown and wrong credentials', async () => {
    const server = app.getHttpServer() as App;
    const unknown = await request(server)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'unknown@example.com', password: 'some-password-value' })
      .expect(401);
    const wrong = await request(server)
      .post('/api/v1/auth/login')
      .set('Origin', 'http://localhost:3000')
      .send({ email: 'brewer@example.com', password: 'wrong-password-value' })
      .expect(401);

    expect(JSON.stringify(unknown.body)).toBe(JSON.stringify(wrong.body));
    expect(unknown.body).toEqual({ status: 'unauthorized' });
    for (const response of [unknown, wrong]) {
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers.vary).toBe('Cookie, Origin');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('fails closed for missing, malformed, expired and revoked session cookies', async () => {
    const server = app.getHttpServer() as App;
    const expired = 'D'.repeat(43);

    for (const cookie of [
      undefined,
      'hb_session=malformed',
      `hb_session=${expired}`,
    ]) {
      const call = request(server).get('/api/v1/auth/session');
      if (cookie) call.set('Cookie', cookie);
      const response = await call.expect(401);
      expect(response.body).toEqual({ status: 'unauthorized' });
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers.vary).toBe('Cookie, Origin');
    }
  });

  it('enforces the anonymous, customer and administrator capability matrix', async () => {
    const server = app.getHttpServer() as App;
    const anonymous = await request(server)
      .get('/api/v1/admin/capabilities')
      .expect(401);
    expect(anonymous.body).toEqual({ status: 'unauthorized' });

    const customerToken = `${'F'.repeat(42)}A`;
    activeSessions.set(customerToken, {
      expiresAt: new Date('2026-08-29T10:00:00.000Z'),
      issuedAt: new Date('2026-08-22T10:00:00.000Z'),
      lastSeenAt: new Date('2026-08-22T10:00:00.000Z'),
      rawToken: customerToken,
      role: 'CUSTOMER',
      sessionId: '20000000-0000-4000-8000-000000000003',
      status: 'ACTIVE',
      userId: '10000000-0000-4000-8000-000000000002',
    });
    const customer = await request(server)
      .get('/api/v1/admin/capabilities')
      .set('Cookie', `hb_session=${customerToken}`)
      .expect(403);
    expect(customer.body).toEqual({ status: 'forbidden' });

    const adminToken = `${'G'.repeat(42)}A`;
    activeSessions.set(adminToken, {
      expiresAt: new Date('2026-08-29T10:00:00.000Z'),
      issuedAt: new Date('2026-08-22T10:00:00.000Z'),
      lastSeenAt: new Date('2026-08-22T10:00:00.000Z'),
      rawToken: adminToken,
      role: 'ADMIN',
      sessionId: '20000000-0000-4000-8000-000000000004',
      status: 'ACTIVE',
      userId: '10000000-0000-4000-8000-000000000003',
    });
    const admin = await request(server)
      .get('/api/v1/admin/capabilities')
      .set('Cookie', `hb_session=${adminToken}`)
      .expect(200);
    expect(admin.body).toEqual({ productManagement: true });

    for (const response of [anonymous, customer, admin]) {
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers.vary).toBe('Cookie, Origin');
    }
  });

  it('rejects unsafe cookie requests with missing CSRF or non-exact Origin', async () => {
    const server = app.getHttpServer() as App;
    const rawToken = 'E'.repeat(43);
    activeSessions.set(rawToken, {
      expiresAt: new Date('2026-08-29T10:00:00.000Z'),
      issuedAt: new Date('2026-08-22T10:00:00.000Z'),
      lastSeenAt: new Date('2026-08-22T10:00:00.000Z'),
      rawToken,
      role: 'CUSTOMER',
      sessionId: '20000000-0000-4000-8000-000000000002',
      status: 'ACTIVE',
      userId: '10000000-0000-4000-8000-000000000001',
    });
    const cookie = `hb_session=${rawToken}`;

    const missingCsrf = await request(server)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'http://localhost:3000')
      .expect(403);
    const wrongOrigin = await request(server)
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .set('Origin', 'http://evil.example')
      .set('X-CSRF-Token', `test-v1.${'A'.repeat(43)}`)
      .expect(403);

    for (const response of [missingCsrf, wrongOrigin]) {
      expect(response.body).toEqual({ status: 'forbidden' });
      expect(response.headers['cache-control']).toBe('private, no-store');
      expect(response.headers.vary).toBe('Cookie, Origin');
    }
    expect(activeSessions.has(rawToken)).toBe(true);
  });

  it('documents only the registration request and generic response DTOs', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/docs-json')
      .expect(200);
    const document = JSON.parse(response.text) as {
      components: { schemas: Record<string, OpenApiSchema> };
      paths: Record<string, { post?: unknown }>;
    };

    const registrationOperation = document.paths['/api/v1/auth/register']
      .post as {
      requestBody?: {
        content?: {
          'application/json'?: { schema?: { $ref?: string } };
        };
        required?: boolean;
      };
    };

    expect(registrationOperation).toBeDefined();
    expect(registrationOperation.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/RegisterDto' },
        },
      },
      required: true,
    });
    expect(document.components.schemas.RegisterDto.required?.sort()).toEqual([
      'email',
      'password',
    ]);
    expect(
      document.components.schemas.RegisterDto.properties?.password,
    ).toMatchObject({
      minLength: 12,
      type: 'string',
      writeOnly: true,
    });
    expect(
      document.components.schemas.RegisterDto.properties?.password,
    ).not.toHaveProperty('maxLength');
    expect(
      document.components.schemas.RegistrationAcceptedDto.required,
    ).toEqual(['status']);
    expect(Object.keys(document.components.schemas).join(' ')).not.toMatch(
      /PasswordCredential|passwordHash|normalizedEmail/i,
    );
  });

  it('documents the exact cookie-auth session transport contract', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/docs-json')
      .expect(200);
    const document = JSON.parse(response.text) as {
      components: {
        schemas: Record<string, OpenApiSchema>;
        securitySchemes: Record<
          string,
          { description: string; in: string; name: string; type: string }
        >;
      };
      paths: Record<
        string,
        Record<
          string,
          {
            parameters?: Array<{
              name: string;
              required: boolean;
              schema: OpenApiSchema;
            }>;
            responses: Record<string, { headers?: Record<string, unknown> }>;
            security?: Array<Record<string, unknown[]>>;
          }
        >
      >;
    };

    expect(document.components.securitySchemes).toEqual({
      cartCookie: {
        description:
          'Host-only local-http opaque guest-cart capability cookie. The raw capability and its digest never appear in response bodies.',
        in: 'cookie',
        name: 'hb_cart',
        type: 'apiKey',
      },
      sessionCookie: {
        description: 'Host-only local-http session cookie.',
        in: 'cookie',
        name: 'hb_session',
        type: 'apiKey',
      },
    });

    const login = document.paths['/api/v1/auth/login'].post;
    const current = document.paths['/api/v1/auth/session'].get;
    const csrf = document.paths['/api/v1/auth/csrf'].get;
    const logout = document.paths['/api/v1/auth/logout'].post;
    const adminCapabilities = document.paths['/api/v1/admin/capabilities'].get;
    expect(login.security).toBeUndefined();
    expect(login.parameters?.map(({ name }) => name)).toEqual(['Origin']);
    expect(login.responses['200'].headers).toHaveProperty('Set-Cookie');
    expect(document.components.schemas.LoginDto).toMatchObject({
      properties: {
        rememberMe: {
          default: false,
          type: 'boolean',
        },
      },
      required: ['email', 'password'],
    });
    expect(current.security).toEqual([{ sessionCookie: [] }]);
    expect(csrf.security).toEqual([{ sessionCookie: [] }]);
    expect(logout.security).toEqual([{ sessionCookie: [] }]);
    expect(logout.parameters?.map(({ name }) => name).sort()).toEqual([
      'Origin',
      'X-CSRF-Token',
    ]);
    expect(logout.responses['200'].headers).toHaveProperty('Set-Cookie');
    expect(adminCapabilities.security).toEqual([{ sessionCookie: [] }]);
    expect(Object.keys(adminCapabilities.responses).sort()).toEqual([
      '200',
      '401',
      '403',
      '503',
    ]);
    expect(document.components.schemas.AdminCapabilitiesDto).toEqual({
      properties: {
        productManagement: {
          description: 'Current administrator may enter product management.',
          example: true,
          type: 'boolean',
        },
      },
      required: ['productManagement'],
      type: 'object',
    });
  });

  it('documents the exact catalog query, envelope and nested DTO bounds', async () => {
    const server = app.getHttpServer() as App;
    const response = await request(server).get('/api/docs-json').expect(200);
    const document = JSON.parse(
      response.text,
    ) as unknown as CatalogOpenApiDocument;
    const operation = document.paths['/api/v1/products'].get;
    const parameters = Object.fromEntries(
      operation.parameters.map((parameter) => [parameter.name, parameter]),
    );
    const schemas = document.components.schemas;

    expect(Object.keys(parameters).sort()).toEqual([
      'category',
      'limit',
      'maxPriceMinor',
      'minPriceMinor',
      'page',
      'search',
      'sort',
    ]);
    expect(
      Object.values(parameters).every(
        (parameter) => parameter.required === false,
      ),
    ).toBe(true);
    expect(parameters.search.schema).toMatchObject({
      maxLength: 80,
      minLength: 2,
      type: 'string',
    });
    expect(parameters.category.schema).toMatchObject({
      maxLength: 64,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      type: 'string',
    });
    expect(parameters.minPriceMinor.schema).toMatchObject({
      format: 'int32',
      maximum: 2_147_483_647,
      minimum: 0,
      type: 'integer',
    });
    expect(parameters.maxPriceMinor.schema).toMatchObject(
      parameters.minPriceMinor.schema,
    );
    expect(parameters.sort.schema).toMatchObject({
      default: 'name-asc',
      enum: ['name-asc', 'name-desc', 'price-asc', 'price-desc'],
      type: 'string',
    });
    expect(parameters.page.schema).toMatchObject({
      default: 1,
      format: 'int32',
      maximum: 200,
      minimum: 1,
      type: 'integer',
    });
    expect(parameters.limit.schema).toMatchObject({
      default: 12,
      format: 'int32',
      maximum: 48,
      minimum: 1,
      type: 'integer',
    });
    expect(
      operation.responses['200'].content?.['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/CatalogResponseDto' });

    expect(schemas.CatalogResponseDto.required?.sort()).toEqual([
      'items',
      'meta',
    ]);
    expect(schemas.CatalogMetaDto.required?.sort()).toEqual([
      'currency',
      'facets',
      'filters',
      'hasNextPage',
      'hasPreviousPage',
      'limit',
      'page',
      'sort',
      'totalItems',
      'totalPages',
    ]);
    expect(schemas.CatalogFiltersDto.required?.sort()).toEqual([
      'category',
      'maxPriceMinor',
      'minPriceMinor',
      'search',
    ]);
    expect(schemas.CatalogFacetsDto.required).toEqual(['categories']);
    expect(schemas.ProductCategoryDto.required?.sort()).toEqual([
      'name',
      'slug',
    ]);
    expect(schemas.ProductDto.required?.sort()).toEqual([
      'amountUnit',
      'availability',
      'category',
      'currency',
      'description',
      'id',
      'imagePath',
      'kitYieldVolumeMl',
      'maximumOrderAmount',
      'minimumOrderAmount',
      'name',
      'orderStepAmount',
      'packageNetWeightMg',
      'priceBasisAmount',
      'priceMinor',
      'priceQualifier',
      'saleKind',
      'slug',
      'stockAmount',
      'teaser',
    ]);
    expect(schemas.ProductDto.properties?.priceMinor).toMatchObject({
      format: 'int32',
      minimum: 0,
      type: 'integer',
    });
    expect(schemas.ProductDto.properties?.name?.pattern).toBeUndefined();
    expect(schemas.ProductDto.properties?.slug?.pattern).toBe(
      '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    );
    expect(schemas.ProductDto.properties?.currency?.enum).toEqual(['USD']);
    expect(schemas.CatalogFiltersDto.properties?.minPriceMinor).toMatchObject({
      format: 'int32',
      maximum: 2_147_483_647,
      minimum: 0,
    });
    expect(schemas.CatalogMetaDto.properties?.page).toMatchObject({
      format: 'int32',
      maximum: 200,
      minimum: 1,
    });
    expect(schemas.CatalogFiltersDto.properties?.search).toMatchObject({
      maxLength: 80,
      minLength: 2,
      type: 'string',
    });
    expect(schemas.CatalogFiltersDto.properties?.category).toMatchObject({
      maxLength: 64,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      type: 'string',
    });
    expect(schemas.CatalogResponseDto.properties).toMatchObject({
      items: {
        items: { $ref: '#/components/schemas/ProductDto' },
        type: 'array',
      },
      meta: { $ref: '#/components/schemas/CatalogMetaDto' },
    });
    expect(schemas.CatalogMetaDto.properties).toMatchObject({
      facets: { $ref: '#/components/schemas/CatalogFacetsDto' },
      filters: { $ref: '#/components/schemas/CatalogFiltersDto' },
    });
    expect(schemas.CatalogFacetsDto.properties).toMatchObject({
      categories: {
        items: { $ref: '#/components/schemas/ProductCategoryDto' },
        type: 'array',
      },
    });
    expect(
      Object.values(schemas).every((schema) => Object.keys(schema).length > 0),
    ).toBe(true);
  });

  it('GET /api/v1/health/live returns the documented body', async () => {
    const server = app.getHttpServer() as App;
    const response = await request(server)
      .get('/api/v1/health/live')
      .expect(200);

    expect(response.body).toEqual({ status: 'ok' });
  });

  it('GET /api/v1/products returns one normalized envelope', async () => {
    const server = app.getHttpServer() as App;
    const response = await request(server).get('/api/v1/products').expect(200);
    const body = JSON.parse(response.text) as CatalogResponseDto;

    expect(body).toMatchObject({
      items: [
        {
          availability: 'in-stock',
          category: { name: 'Hops', slug: 'hops' },
          currency: 'USD',
          name: 'Cascade Hops',
          slug: 'cascade-hops',
        },
      ],
      meta: {
        currency: 'USD',
        facets: { categories: [{ name: 'Hops', slug: 'hops' }] },
        filters: {
          category: null,
          maxPriceMinor: null,
          minPriceMinor: null,
          search: null,
        },
        hasNextPage: false,
        hasPreviousPage: false,
        limit: 12,
        page: 1,
        sort: 'name-asc',
        totalItems: 1,
        totalPages: 1,
      },
    });
    expect(Object.keys(body).sort()).toEqual(['items', 'meta']);
    expect(Object.keys(body.items[0]).sort()).toEqual([
      'amountUnit',
      'availability',
      'category',
      'currency',
      'description',
      'id',
      'imagePath',
      'kitYieldVolumeMl',
      'maximumOrderAmount',
      'minimumOrderAmount',
      'name',
      'orderStepAmount',
      'packageNetWeightMg',
      'priceBasisAmount',
      'priceMinor',
      'priceQualifier',
      'saleKind',
      'slug',
      'stockAmount',
      'teaser',
    ]);
    expect(Object.keys(body.meta).sort()).toEqual([
      'currency',
      'facets',
      'filters',
      'hasNextPage',
      'hasPreviousPage',
      'limit',
      'page',
      'sort',
      'totalItems',
      'totalPages',
    ]);
  });

  it('documents and returns the exact public product-detail contract', async () => {
    const server = app.getHttpServer() as App;
    const documentResponse = await request(server)
      .get('/api/docs-json')
      .expect(200);
    const document = JSON.parse(documentResponse.text) as {
      components: { schemas: Record<string, OpenApiSchema> };
      paths: Record<string, { get: Record<string, unknown> }>;
    };
    const operation = document.paths['/api/v1/products/{slug}'].get as {
      parameters: Array<{
        name: string;
        required: boolean;
        schema: OpenApiSchema;
      }>;
      responses: Record<
        string,
        { content?: { 'application/json': { schema: { $ref: string } } } }
      >;
    };

    expect(operation.parameters).toHaveLength(1);
    expect(operation.parameters[0]).toMatchObject({
      name: 'slug',
      required: true,
    });
    expect(operation.parameters[0]?.schema).toEqual({
      maxLength: 64,
      pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      type: 'string',
    });
    expect(
      operation.responses['200'].content?.['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/ProductDetailDto' });
    expect(operation.responses).toHaveProperty('404');
    expect(
      document.components.schemas.ProductDetailDto.required?.sort(),
    ).toEqual([
      'amountUnit',
      'availability',
      'category',
      'currency',
      'description',
      'id',
      'imagePath',
      'kitYieldVolumeMl',
      'maximumOrderAmount',
      'minimumOrderAmount',
      'name',
      'orderStepAmount',
      'packageNetWeightMg',
      'priceBasisAmount',
      'priceMinor',
      'priceQualifier',
      'saleKind',
      'slug',
      'specifications',
      'stockAmount',
      'teaser',
    ]);
    expect(
      document.components.schemas.ProductDetailDto.properties?.specifications,
    ).toMatchObject({
      items: { $ref: '#/components/schemas/ProductSpecificationDto' },
      minItems: 1,
      type: 'array',
    });
    expect(
      document.components.schemas.ProductSpecificationDto.required?.sort(),
    ).toEqual(['label', 'value']);
    expect(
      document.components.schemas.ProductSpecificationDto.properties?.label,
    ).toMatchObject({ minLength: 1, type: 'string' });
    expect(
      document.components.schemas.ProductSpecificationDto.properties?.value,
    ).toMatchObject({
      oneOf: [
        { minLength: 1, type: 'string' },
        {
          items: { minLength: 1, type: 'string' },
          minItems: 1,
          type: 'array',
        },
      ],
    });

    const response = await request(server)
      .get('/api/v1/products/cascade-hops')
      .expect(200);
    expect(response.body).toEqual({
      amountUnit: 'MILLIGRAM',
      availability: 'in-stock',
      category: { name: 'Hops', slug: 'hops' },
      currency: 'USD',
      description: 'Bright whole-cone hops',
      id: '20000000-0000-4000-8000-000000000002',
      imagePath: '/assets/products/cascade-hops.webp',
      kitYieldVolumeMl: null,
      maximumOrderAmount: null,
      minimumOrderAmount: 100_000,
      name: 'Cascade Hops',
      orderStepAmount: 100_000,
      packageNetWeightMg: null,
      priceBasisAmount: 100_000,
      priceMinor: 699,
      priceQualifier: 'per 100g',
      saleKind: 'WEIGHT',
      slug: 'cascade-hops',
      stockAmount: 100_000_000,
      specifications: [
        { label: 'Origin', value: 'USA' },
        { label: 'Uses', value: ['Late additions', 'Dry hopping'] },
      ],
      teaser: 'Citrus and floral whole-cone hops.',
    });
    expect(response.body).not.toHaveProperty('isActive');
  });

  it('fails product detail closed for invalid and unknown slugs', async () => {
    const server = app.getHttpServer() as App;

    await request(server).get('/api/v1/products/Invalid_Slug').expect(400);
    const response = await request(server)
      .get('/api/v1/products/unknown-product')
      .expect(404);
    expect(response.body).toEqual({
      error: 'Not Found',
      message: 'Product not found',
      statusCode: 404,
    });
  });

  it('uses the production validation helper for valid normalized query input', async () => {
    const server = app.getHttpServer() as App;

    await request(server)
      .get('/api/v1/products')
      .query({
        category: 'hops',
        limit: '48',
        maxPriceMinor: '2147483647',
        minPriceMinor: '0',
        page: '200',
        search: '  Cafe\u0301   hops  ',
        sort: 'price-desc',
      })
      .expect(200);
    await request(server)
      .get('/api/v1/products')
      .query({ search: 'ab％cd＿ef' })
      .expect(200);
  });

  it.each([
    ['/api/v1/products?unknown=value', 'unknown parameter'],
    ['/api/v1/products?__proto__=value', 'prototype key'],
    ['/api/v1/products?constructor=value', 'constructor key'],
    ['/api/v1/products?toString=value', 'inherited-name key'],
    ['/api/v1/products?page[]=1', 'list syntax'],
    ['/api/v1/products?category=Hops', 'uppercase category'],
    ['/api/v1/products?minPriceMinor=01', 'leading zero'],
    ['/api/v1/products?maxPriceMinor=2147483648', 'price overflow'],
    ['/api/v1/products?minPriceMinor=10&maxPriceMinor=9', 'reversed range'],
    ['/api/v1/products?page=201', 'page overflow'],
    ['/api/v1/products?limit=49', 'limit overflow'],
    ['/api/v1/products?sort=created-desc', 'unsupported sort'],
    ['/api/v1/products?search=ab%25cd', 'decoded percent'],
    ['/api/v1/products?search=ab%5Fcd', 'decoded underscore'],
    ['/api/v1/products?search=ab%00cd', 'decoded control'],
    ['/api/v1/products?search=aa&search=bb', 'repeated search'],
    ['/api/v1/products?category=hops&category=malts', 'repeated category'],
    ['/api/v1/products?minPriceMinor=1&minPriceMinor=2', 'repeated minimum'],
    ['/api/v1/products?maxPriceMinor=1&maxPriceMinor=2', 'repeated maximum'],
    ['/api/v1/products?sort=name-asc&sort=name-desc', 'repeated sort'],
    ['/api/v1/products?page=1&page=2', 'repeated page'],
    ['/api/v1/products?limit=1&limit=2', 'repeated limit'],
  ])('returns 400 for %s (%s)', async (path) => {
    const server = app.getHttpServer() as App;
    await request(server).get(path).expect(400);
  });

  it('GET /api/v1/health/ready returns 200', async () => {
    const server = app.getHttpServer() as App;
    await request(server).get('/api/v1/health/ready').expect(200);
  });

  afterAll(async () => {
    await app.close();
  });
});
