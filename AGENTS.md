# Hop & Barley Project Operations

## Read first

- Before execution, read a decision-complete Notion ticket, relevant architecture and the linked Running Agent Run. Read-only status work reuses those records and never authorizes a mutation.
- Read [`docs/engineering-workflow.md`](docs/engineering-workflow.md) before planning, implementation, integration or review; it defines the detailed delivery, evidence, verification and rollback lifecycle.
- This `AGENTS.md` is the sole source of truth for the worker concurrency limit. Do not duplicate a numeric worker limit in the engineering workflow or its machine contract.
- Implementation truth lives in repository code, tests, migrations and Git history. Notion owns intent, decisions, tickets and Agent Runs. GitHub owns PR, CI, review and merge evidence.
- Before external writes, confirm scope, dependencies, acceptance criteria, risk, verification, rollback and current-thread authority.
- One ticket owns one `codex/<ticket>-<slug>` branch and one pull request. Never mix vertical scopes.

## Delivery lifecycle

1. Start from current `main`; create a Running Agent Run before execution or delegation.
2. Implement the smallest reversible ticket-owned change.
3. Keep temporary screenshots, traces, reports, coverage and generated evidence out of Git.
4. Push a draft PR and wait for required CI to be green.
5. Start one independent exact-head reviewer only after green CI.
6. Merge only after PASS; a new head invalidates the verdict. Then mark the ticket and every Agent Run terminal.

## Cost-aware orchestration

- New project work is led by one `gpt-6-astra` Medium orchestrator, which must read and decompose the Notion ticket, delegate bounded implementation, integrate it and verify closure. The current root may fulfill that role; reuse the existing orchestrator for follow-ups and status, and never spawn recursive orchestrators.
- The root orchestrator owns one vertical scope, integration, PR and final status. It does not maintain an idle agent pool.
- Use one root orchestrator plus at most three spawned workers concurrently, for four total slots. Stop or reuse each worker immediately after its handoff; never leave completed agents waiting.
- `gpt-5.6-terra` Medium: ordinary frontend/backend implementation and integration work.
- `gpt-5.6-luna` Medium: bounded mechanical edits, fixtures, routine test execution, inventories and documentation.
- `gpt-5.6-sol` High: security-sensitive, risky or uncertain work, plus the independent exact-head closure review.
- Always set model and reasoning effort explicitly when delegating. Record a one-line cost/correctness rationale in the Agent Run.
- Fall back upward to Sol when boundaries, security, data integrity or correctness are unclear. Never fall back downward merely to save cost after a worker reports uncertainty.
- Keep Notion handoff, status, blocker and closure evidence current; terminal Agent Runs require evidence, and unknown completion is not Done.
- Do not start a second vertical scope until the current PR is merged or explicitly Blocked.

## Project baseline and safety

- pnpm/Turborepo monorepo: Next.js web, NestJS API, Prisma and PostgreSQL.
- Local stack: `pnpm local:up`; inspect with `docker compose ps -a`; logs via `pnpm local:logs`; stop without data deletion using `pnpm local:down`.
- Frontend: `http://localhost:3000`; API index: `http://localhost:3001`; versioned routes: `/api/v1`.
- Production hosting is provider-neutral and undecided. Do not add provider-specific deployment configuration without an approved decision and ticket.
- Never reset a database, use `db push --force-reset`, run `docker compose down -v`, delete volumes, expose secrets or mutate shared review infrastructure without explicit approval.

## Tool and skill routing

- Use Graphify first when `graphify-out/graph.json` exists, then verify claims in authoritative source.
- Use `application-architecture` for boundaries/ADRs and `local-stack-operations` for Compose/PostgreSQL/Prisma operations.
- Use Context7 for current framework/library/CLI behavior; use version-matched Next.js docs in `apps/web`.
- Use `playwright` for real browser claims. Static inspection alone does not prove a UI flow.
- Missing connector output is unknown, not success. Never store credentials in Git, Notion, GitHub, prompts or run logs.

## Scoped instructions

- Frontend: `apps/web/AGENTS.md`
- Backend/data: `apps/api/AGENTS.md`
- Browser tests: `apps/e2e/AGENTS.md`
