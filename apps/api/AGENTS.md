# Hop & Barley API

- Follow the root `AGENTS.md`, relevant ticket and architecture first. API tickets use one branch/PR and the root model-routing/lifecycle rules.
- Keep NestJS 11 as a modular monolith. Use `nestjs-best-practices` as a checklist and Context7 for current NestJS syntax.
- Public routes live under `/api/v1`; `GET /` is a developer service index and must not expose logs or secrets. Swagger UI is `/api/docs`.
- Keep `main.ts`, validation/bootstrap behavior, OpenAPI generation, generated client and production-like e2e routing aligned.
- Prisma schema plus committed migrations define database history. Create migrations for schema changes; never replace history with `db push`.
- The API owns prices, inventory, permissions, totals and state transitions. The web must not import backend source or access PostgreSQL.
- Validate environment input and DTO boundaries. Default-deny unknown input; avoid leaking entity fields, credentials or internal errors.
- Use `prisma-cli`, `prisma-client-api` or `prisma-database-setup` for their matching tasks; use PostgreSQL guidance only as a design/performance checklist.
- Use `local-stack-operations` for Compose, readiness, migrations, seed and disposable database verification.
- Database tests/reviews use ticket/run-named disposable resources. Never mutate shared Compose data or delete volumes without explicit approval.
- Handoff evidence is concise: changed paths, targeted unit/API/PostgreSQL checks, generated-contract status, cleanup and exact head SHA. Do not commit generated test reports.
- Keep runtime configuration provider-neutral and secrets outside repository files, Notion, prompts and logs.
