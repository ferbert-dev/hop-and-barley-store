# `@hop-and-barley/api-client`

This private workspace package turns the NestJS OpenAPI document into a type-safe TypeScript client boundary.

## Pipeline

1. `apps/api/scripts/generate-openapi.ts` creates `apps/api/openapi.json` from live NestJS controller and DTO metadata.
2. `openapi-typescript` generates `src/generated/schema.ts`.
3. `src/client.ts` wraps `openapi-fetch` with a typed `createApiClient(baseUrl)` factory.
4. `src/index.ts` exposes the handwritten client boundary and generated types.

Run generation and validation from the repository root:

```bash
pnpm api:generate
pnpm --filter @hop-and-barley/api-client typecheck
pnpm --filter @hop-and-barley/api-client build
```

Never edit `src/generated/schema.ts` manually. Change the NestJS route/DTO metadata, regenerate the contract, and review the resulting diff instead.

## Intended Usage

```ts
import { createApiClient } from '@hop-and-barley/api-client';

const api = createApiClient('http://localhost:3001');
const { data, error } = await api.GET('/api/v1/products');
```

The current storefront vertical slice has not adopted this package at runtime yet; it still uses a server-side `fetch` and a local response type. This package is ready and validated, and wiring it into `apps/web` is the next API-contract integration step.

This package contains API types and transport helpers only. It must not contain React components, NestJS internals, Prisma models, credentials, or business logic.
