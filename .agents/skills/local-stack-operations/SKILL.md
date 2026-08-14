---
name: local-stack-operations
description: Safely start, stop, inspect, migrate, seed, verify, and troubleshoot the Hop & Barley local Docker Compose stack with Next.js, NestJS, Prisma, and PostgreSQL. Use for docker compose commands, local service health, PostgreSQL readiness, Prisma migration or seed work, local frontend-to-API checks, and container log diagnosis.
---

# Local Stack Operations

Operate the repository's single full local-development stack without deleting data or introducing a production-provider assumption.

## Inspect Before Acting

1. Read the root `AGENTS.md` and relevant ticket.
2. Inspect `compose.yaml`, `.env.example`, `apps/api/prisma.config.ts`, `apps/api/prisma/schema.prisma`, and existing migrations before changing runtime or data behavior.
3. Check `git status --short` and preserve unrelated user changes.
4. Use only example/local credentials already present in repository configuration. Never copy real secrets into files, commands, logs, tickets, or prompts.

## Start and Verify the Full Local Stack

1. Run `pnpm local:up`. This builds and starts PostgreSQL, the migration/seed job, the NestJS API, and the Next.js frontend.
2. Inspect `docker compose ps -a`. Require:
   - `postgres` healthy;
   - `migrate` exited successfully;
   - `api` healthy;
   - `web` healthy.
3. Verify the runtime endpoints:
   - `GET http://127.0.0.1:3001/` renders the developer service console;
   - `GET http://127.0.0.1:3001/api/docs` renders Swagger UI;
   - `GET http://127.0.0.1:3001/api/v1/health/ready` succeeds;
   - `GET http://127.0.0.1:3001/api/v1/products` returns catalog data;
   - `http://127.0.0.1:3000` visibly reports `API connected`.
4. Use Playwright for the browser check when UI behavior is in scope.

## Change the Database Safely

1. Edit `apps/api/prisma/schema.prisma`.
2. Run `pnpm db:generate` after schema/client changes.
3. Against the local development database, create a named migration with `pnpm db:migrate:dev -- --name <migration-name>`.
4. Review the generated SQL before accepting the migration.
5. Run `pnpm db:seed` when seed behavior is in scope.
6. Re-run API tests and full-stack verification.

Use `prisma migrate deploy` only for applying already committed migrations in the migration container or a future authorized production pipeline. Never use it as a substitute for creating and reviewing migrations during development.

## Diagnose Without Destroying State

Start with read-only evidence:

1. `docker compose ps -a`
2. `docker compose logs migrate`
3. `docker compose logs api`
4. `docker compose logs web`
5. `docker compose logs postgres`

Trace the first unhealthy dependency in order: PostgreSQL, migration job, API, then frontend. Verify actual HTTP responses rather than inferring health from a running process alone.

## Stop Safely

Run `pnpm local:down` or `docker compose down`. These preserve the named PostgreSQL volume.

Never run `prisma migrate reset`, `prisma db push --force-reset`, `docker compose down -v`, `docker volume rm`, or manually delete database/container state without explicit user approval for the exact destructive target.

## Production Boundary

Production hosting and deployment are intentionally undecided. Keep Docker images and runtime configuration portable. Do not add Vercel-, Oracle-, or other provider-specific deployment configuration, publish images, change remote infrastructure, or deploy without an explicit architecture decision, ticket, rollback plan, and current authority.
