# Hop & Barley API

- Read the repository-root `AGENTS.md` and the relevant architecture/ticket before state-changing work.
- Keep the NestJS 11 application as a modular monolith. Use `nestjs-best-practices` as a review checklist and Context7 for current NestJS API and configuration syntax.
- Public application routes are versioned under `/api/v1`; `GET /` is only the developer service console and must never expose raw logs or secrets. Swagger UI lives at `/api/docs`. Keep `main.ts`, OpenAPI generation, and end-to-end test routing aligned.
- Prisma schema and committed migrations are the database source of truth. Use `prisma-cli`, `prisma-client-api`, and `prisma-database-setup` for the matching task, and `supabase-postgres-best-practices` for PostgreSQL design/performance guidance.
- Use `local-stack-operations` for Docker Compose, migrations, seed data, readiness, and safe local data handling.
- Create migrations for schema changes. Never replace migration history with `db push`, reset a database, delete a volume, or embed credentials without explicit authority.
- Validate environment input, DTO boundaries, generated OpenAPI/client output, unit tests, and API end-to-end tests before handoff.
- Production hosting is provider-neutral and undecided; keep runtime configuration portable.
