import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureAppRouting } from './../src/app-routing';
import { configureAppValidation } from './../src/app-validation';
import type { CatalogResponseDto } from './../src/catalog/dto/catalog-response.dto';
import { PrismaService } from './../src/database/prisma.service';
import { configureOpenApi } from './../src/openapi';

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
                category: { name: 'Hops', slug: 'hops' },
                currency: 'USD',
                description: 'Bright whole-cone hops',
                id: '20000000-0000-4000-8000-000000000002',
                imagePath: '/assets/products/cascade-hops.webp',
                name: 'Cascade Hops',
                priceMinor: 699,
                priceQualifier: 'per pound',
                slug: 'cascade-hops',
                specifications: [
                  { label: 'Origin', value: 'USA' },
                  { label: 'Uses', value: ['Late additions', 'Dry hopping'] },
                ],
                stockQuantity: 100,
                teaser: 'Citrus and floral whole-cone hops.',
              })
            : Promise.resolve(null),
        ),
      findMany: jest.fn().mockResolvedValue([
        {
          category: { name: 'Hops', slug: 'hops' },
          currency: 'USD',
          description: 'Bright whole-cone hops',
          id: '20000000-0000-4000-8000-000000000002',
          imagePath: '/assets/products/cascade-hops.webp',
          name: 'Cascade Hops',
          priceMinor: 699,
          priceQualifier: 'per pound',
          slug: 'cascade-hops',
          stockQuantity: 100,
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
      memoryCost: 65_536,
      parallelism: 1,
      passwordHash: '$argon2id$v=19$m=65536,p=1,t=3$salt$hash',
      saltLength: 16,
      timeCost: 3,
      version: 19,
    });
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
    configureAppValidation(app);
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

  it('POST /api/v1/auth/register returns only the generic private accepted contract', async () => {
    const response = await request(app.getHttpServer() as App)
      .post('/api/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .set('X-Request-Id', 'safe-request-1')
      .send({
        email: 'Brew.Master@BÜCHER.example',
        password: 'correct horse battery staple',
      })
      .expect(202);

    expect(response.body).toEqual({ status: 'accepted' });
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.headers.vary).toBe('Origin');
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
        email: 'BREW.MASTER@xn--bcher-kva.example',
        password: 'another correct horse battery staple',
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
        password: 'correct horse battery staple',
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
      expect(response.headers.vary).toBe('Origin');
      expect(response.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it('documents only the registration request and generic response DTOs', async () => {
    const response = await request(app.getHttpServer() as App)
      .get('/api/docs-json')
      .expect(200);
    const document = JSON.parse(response.text) as {
      components: { schemas: Record<string, OpenApiSchema> };
      paths: Record<string, { post?: unknown }>;
    };

    expect(document.paths['/api/v1/auth/register'].post).toBeDefined();
    expect(document.components.schemas.RegisterDto.required?.sort()).toEqual([
      'email',
      'password',
    ]);
    expect(
      document.components.schemas.RegisterDto.properties?.password,
    ).toMatchObject({
      maxLength: 128,
      minLength: 15,
      type: 'string',
      writeOnly: true,
    });
    expect(
      document.components.schemas.RegistrationAcceptedDto.required,
    ).toEqual(['status']);
    expect(Object.keys(document.components.schemas).join(' ')).not.toMatch(
      /PasswordCredential|passwordHash|normalizedEmail/i,
    );
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
      'availability',
      'category',
      'currency',
      'description',
      'id',
      'imagePath',
      'name',
      'priceMinor',
      'priceQualifier',
      'slug',
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
      'availability',
      'category',
      'currency',
      'description',
      'id',
      'imagePath',
      'name',
      'priceMinor',
      'priceQualifier',
      'slug',
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
      'availability',
      'category',
      'currency',
      'description',
      'id',
      'imagePath',
      'name',
      'priceMinor',
      'priceQualifier',
      'slug',
      'specifications',
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
      availability: 'in-stock',
      category: { name: 'Hops', slug: 'hops' },
      currency: 'USD',
      description: 'Bright whole-cone hops',
      id: '20000000-0000-4000-8000-000000000002',
      imagePath: '/assets/products/cascade-hops.webp',
      name: 'Cascade Hops',
      priceMinor: 699,
      priceQualifier: 'per pound',
      slug: 'cascade-hops',
      specifications: [
        { label: 'Origin', value: 'USA' },
        { label: 'Uses', value: ['Late additions', 'Dry hopping'] },
      ],
      teaser: 'Citrus and floral whole-cone hops.',
    });
    expect(response.body).not.toHaveProperty('stockQuantity');
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
