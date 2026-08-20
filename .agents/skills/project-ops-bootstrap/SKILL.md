---
name: project-ops-bootstrap
description: Create a new, auditable project-operations workspace in a repository and Notion. Use when starting a project that needs an architecture hub, linked Tickets, Agent Registry, and Agent Runs databases, GitHub evidence, agent roles, ticket lifecycle, and repeatable delivery governance.
---

# Project Ops Bootstrap

Create a fresh project operations system. Never reuse Notion page IDs, database IDs, credentials, or live records from another project.

## Preconditions

1. Confirm the target repository and project name.
2. Read the target repository's instructions and preserve existing changes.
3. Confirm that Notion and GitHub connectors are available with read access.
4. Ask before any external creation if the user has not explicitly requested creation.

## Install

1. Search Notion for a Project Hub with both the requested project name and the exact GitHub repository URL. Treat a match as an existing installation only when its linked Tickets, Agent Registry, and Agent Runs databases are present.
2. If a complete exact match exists, report it and verify its live schema; do not create a duplicate. If a name-only or repository-only match exists, show the ambiguity and ask whether to repair, reuse, or create a separate project.
3. If no exact match exists, create a new Project Hub and four new databases under it: Architecture, Tickets, Agent Registry, and Agent Runs. Create relations exactly as specified in `references/notion-schema.md`.
4. Seed the Agent Registry from `assets/notion/agent-roles.md`; create the Bootstrap Epic and Setup ticket from `assets/notion/seed-records.md`.
5. Run `scripts/init_local.py <project-root> --project-name "<name>" --mode core`. Review the reported files. Do not overwrite existing files unless the user explicitly approves it.
6. Populate the Architecture page from the repository's verified source and `assets/docs/architecture-template.md`; mark unknown items as open questions.
7. Connect the GitHub repository link to the Hub and the Bootstrap ticket. Do not create a branch, PR, issue, secret, deployment, or credential unless separately requested.
8. Run `scripts/verify_local.py <project-root>` and read back the live Notion schema. Report missing relations, invalid status options, or unavailable connectors as blockers.

## Operating rules

- Use Notion for intent, tickets, decisions, roles, and Agent Runs; GitHub for branches, PRs, CI, and merge evidence; repository code/tests/migrations for implemented truth.
- Give each executable ticket one primary role and testable acceptance criteria. Require an Epic for multi-slice work.
- Create an Agent Run before delegation and finalize every run, including blocked and cancelled ones.
- Require one independent closure review for mutating tickets. Do not mark a ticket Done without verified evidence.
- The root orchestrator owns one vertical scope, integration, PR and final status; do not start another scope until the current PR is merged or explicitly blocked.
- Delegate to at most two disjoint workers and never maintain an idle agent pool. Stop or reuse completed workers immediately after handoff.
- Route Sol to architecture, security-sensitive work and exact-head review; Terra to routine feature implementation/integration; Luna to bounded mechanical, repetitive test/data and documentation work.
- Set model and reasoning effort explicitly and record a cost/correctness rationale. Unclear boundaries, security, data integrity, correctness or worker uncertainty always escalate upward to Sol.
- Start one independent reviewer only after required CI is green. A new head invalidates the verdict.
- Store no secret, token, password, raw provider payload, or personal data in templates, Notion, Git, or Agent Runs.
- Use `light` mode only when the user explicitly chooses it; it omits mandatory Epic and Agent Run gates.

## Resources

- `references/notion-schema.md`: database properties, relations, views, and seed sequence.
- `assets/repository/`: portable repository templates.
- `assets/notion/`: seed content for roles and the first two records.
- `scripts/init_local.py`: idempotently copies only missing local templates.
- `scripts/verify_local.py`: verifies the local installation.
