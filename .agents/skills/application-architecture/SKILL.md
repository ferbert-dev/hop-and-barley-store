---
name: application-architecture
description: Review, design, document, and evolve Hop & Barley application architecture with evidence, explicit tradeoffs, diagrams, ADR-ready decisions, migration paths, and rollback plans. Use for system design, monorepo boundaries, frontend/backend/data/API contracts, deployment topology, scalability, reliability, security, observability, architecture reviews, and decisions about introducing or rejecting new infrastructure.
---

# Application Architecture

Guide architecture work toward the smallest evidence-backed design that satisfies current product and quality requirements. Keep current implementation, approved decisions, and future targets visibly separate.

## Establish the Evidence Boundary

1. Read the root `AGENTS.md`, relevant ticket, and applicable scoped instructions.
2. Inspect source, tests, Prisma schema/migrations, package manifests, Docker configuration, and Git history. These define current implementation.
3. Read `docs/hop-and-barley-monorepo-plan.md` as a target blueprint, not proof that every described component exists.
4. Use Notion for intent, decisions, tickets, roles, and Agent Runs; use GitHub for review, CI, merge, and deployment evidence.
5. If `graphify-out/graph.json` exists, query Graphify first for architecture and relationship navigation, then verify every material claim in authoritative repository files. If it does not exist, use direct repository inspection and state that graph coverage is unavailable.
6. Use Context7 for current framework, library, SDK, CLI, and cloud-provider behavior. Never rely on remembered syntax for version-sensitive decisions.

Label every architectural statement as one of:

- **Implemented:** proven by current code, migrations, tests, or runtime evidence.
- **Decided:** approved intent exists, but implementation may be incomplete.
- **Proposed:** an option awaiting a decision.
- **Unknown:** evidence or connector coverage is unavailable.

## Frame the Decision

Before proposing a design, define:

- the product capability or failure being addressed;
- affected users and systems;
- hard constraints and non-goals;
- required quality attributes such as security, correctness, reliability, latency, cost, portability, operability, and delivery speed;
- expected scale with evidence, not imagined internet-scale traffic;
- data ownership, trust boundaries, and destructive migration risk;
- the smallest reversible decision point.

Do not introduce infrastructure merely because it is common in larger systems.

## Evaluate Options

For a non-trivial decision, compare at least two viable options, including the option to defer. Evaluate:

| Dimension    | Questions                                                              |
| ------------ | ---------------------------------------------------------------------- |
| Product fit  | Does it unlock the current ticket or only hypothetical work?           |
| Complexity   | What code, services, configuration, and team knowledge are added?      |
| Correctness  | Where are invariants and transactions enforced?                        |
| Security     | What new trust boundaries, credentials, and attack surfaces appear?    |
| Reliability  | What fails, how is it detected, and how does the system degrade?       |
| Operability  | How are health, logs, metrics, traces, backups, and incidents handled? |
| Data         | Who owns data, how is it migrated, and how is rollback performed?      |
| Cost         | What local, CI, hosted, and maintenance costs recur?                   |
| Portability  | Does the choice unnecessarily bind the system to a provider?           |
| Verification | Which automated tests and runtime probes prove the design?             |

Recommend one option with reasons and explicitly list its negative consequences.

## Preserve Project Defaults

Treat these as defaults until evidence and an approved decision justify change:

- pnpm/Turborepo monorepo with independently buildable apps;
- Next.js frontend and NestJS modular-monolith API;
- PostgreSQL as the transactional source of truth;
- Prisma schema plus committed migrations, never `db push` as production history;
- backend ownership of prices, inventory, discounts, permissions, order totals, and state transitions;
- OpenAPI generated from NestJS metadata, then a generated TypeScript client;
- no frontend import from backend source and no browser access to PostgreSQL;
- one full local Docker Compose environment;
- provider-neutral production design until a provider is explicitly selected;
- no microservices, queues, caches, Kafka, Kubernetes, or distributed transactions without demonstrated need.

## Produce Architecture Artifacts

Use the smallest useful artifact:

- Mermaid flowchart for containers, ownership, and dependencies;
- Mermaid sequence diagram for request, failure, or state-change flow;
- table for option comparison or exact responsibility mapping;
- ADR when a durable, cross-cutting choice is accepted.

An ADR should contain:

1. title and status;
2. context and evidence;
3. decision;
4. alternatives considered;
5. positive and negative consequences;
6. implementation/migration stages;
7. verification and observability;
8. rollback or exit strategy;
9. links to the ticket, code, tests, and review evidence.

Do not create a diagram that presents planned modules or external services as deployed. Use dashed lines or explicit `planned` labels for future relationships.

## Gate Implementation

Architecture advice does not itself authorize code, infrastructure, external writes, deployment, or destructive migration.

Before implementation, require:

- a scoped ticket and acceptance criteria;
- dependency and migration order;
- safe handling of secrets;
- test and runtime verification plan;
- rollout and rollback plan proportional to risk;
- independent closure review before Done;
- current-thread authority for commit, push, merge, or deployment.

Prefer a vertical slice that proves the architecture through working code over empty modules, packages, or speculative scaffolding.

## Report Clearly

Lead with the recommendation, then provide:

1. evidence-backed current state;
2. decision drivers and constraints;
3. options and tradeoffs;
4. recommended target and diagram;
5. staged migration;
6. verification, observability, and rollback;
7. open decisions or unknowns.

Call out stale blueprint text or documentation drift instead of silently following it.
