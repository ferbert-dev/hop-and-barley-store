# Project Operations

Read the project architecture and relevant ticket before state-changing work.

Sources of truth: repository code, tests, migrations, and Git history define implementation; Notion defines intent, tickets, decisions, roles, and Agent Runs; GitHub defines review, CI, merge, and deployment evidence.

Before implementation or external writes, inspect repository state, identify the ticket, confirm acceptance criteria, risks, verification, rollback, and authority. Create an Agent Run before delegation.

Each ticket has one primary role. Use an Epic for multi-slice work. Every mutating ticket needs an independent closure review before Done. Do not store secrets or credentials in repository files, Notion, GitHub, prompts, or run logs.

## Project Baseline

- This repository is a pnpm/Turborepo monorepo with a Next.js frontend, a NestJS API, Prisma, and PostgreSQL.
- Local development is one full stack defined by `compose.yaml`. Start it with `pnpm local:up`, inspect it with `docker compose ps -a`, follow logs with `pnpm local:logs`, and stop it without deleting data with `pnpm local:down`.
- The local frontend is `http://localhost:3000`. The backend service index is `http://localhost:3001`; versioned API routes live under `/api/v1`.
- Production hosting is intentionally provider-neutral and undecided. Do not add Vercel-specific, Oracle-specific, or other provider-specific deployment configuration without an explicit decision and ticket.
- Never run destructive database or container operations such as `prisma migrate reset`, `prisma db push --force-reset`, `docker compose down -v`, or volume deletion without explicit user approval.

## Skill and Connector Routing

- Use `graphify` first for repository architecture, file relationships, and project-content discovery when `graphify-out/graph.json` exists. Treat it as navigation, then verify every implementation claim against source, tests, migrations, and Git history.
- Use the repository skill `application-architecture` for system design, boundaries, architecture review, durable decisions, ADRs, deployment topology, and introduction or rejection of new infrastructure.
- Use `ctx7-docs` for current framework, library, SDK, CLI, and cloud-service documentation. In `apps/web`, also follow the version-matched Next.js guidance in its scoped `AGENTS.md`.
- For React performance work, use `vercel-react-best-practices`; its name does not select Vercel as the deployment provider.
- For NestJS work, use `nestjs-best-practices` as a community checklist, while Context7, current NestJS documentation, and repository evidence remain authoritative.
- For Prisma work, route to `prisma-cli`, `prisma-client-api`, or `prisma-database-setup` as appropriate. For PostgreSQL schema/query performance, use `supabase-postgres-best-practices` without assuming the project uses Supabase hosting.
- Use the repository skill `local-stack-operations` for Docker Compose, PostgreSQL readiness, Prisma migration/seed, and local full-stack verification.
- Use `playwright` for real-browser UI and integration checks. Do not claim a UI flow works from static code inspection alone.
- Use the Figma connector for design evidence, the Notion connector for project intent/tickets/runs, and the GitHub connector for repository, review, CI, and deployment evidence. Missing connector output or access is unknown, not success.
- Do not commit, push, open or merge a pull request, or deploy without current-thread authority.

## Scoped Instructions

- Frontend work must also follow `apps/web/AGENTS.md`.
- Backend and data work must also follow `apps/api/AGENTS.md`.
- Browser end-to-end work must also follow `apps/e2e/AGENTS.md`.
