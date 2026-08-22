# Project Operations

## Sources and scope

- Read the architecture and relevant Notion ticket before state-changing work.
- Read [`docs/engineering-workflow.md`](docs/engineering-workflow.md) before planning, implementation, integration or review; it defines the detailed delivery, evidence, verification and rollback lifecycle.
- This `AGENTS.md` is the sole source of truth for the worker concurrency limit. Do not duplicate a numeric worker limit in the engineering workflow or its machine contract.
- Repository code, tests, migrations and Git history define implementation. Notion owns intent, tickets, decisions and Agent Runs. GitHub owns PR, CI, review and merge evidence.
- Confirm dependencies, acceptance criteria, risk, verification, rollback and authority before external writes.
- One ticket owns one `codex/<ticket>-<slug>` branch and one PR. Use an Epic for multiple vertical slices.

## Cost-aware orchestration

- The root orchestrator owns one vertical scope, integration, PR and final status; it does not keep an idle agent pool.
- Use one root orchestrator plus at most three spawned workers concurrently, for four total slots. Stop or reuse each worker immediately after handoff.
- `gpt-5.6-sol`: architecture, security-sensitive/risky cross-cutting work and independent exact-head review.
- `gpt-5.6-terra`: routine feature implementation, medium-complexity fixes and integration.
- `gpt-5.6-luna`: bounded mechanical edits, fixtures, repetitive tests, inventories and documentation.
- Set model and reasoning effort explicitly; record one cost/correctness sentence in the Agent Run.
- Unclear boundaries, security, data integrity, correctness or worker uncertainty escalate upward to Sol.
- Do not start a second vertical scope until the current PR is merged or explicitly Blocked.

## Delivery and safety

1. Create a Running Agent Run before delegation.
2. Implement the smallest reversible ticket-owned change.
3. Keep screenshots, traces, reports, coverage and generated evidence out of Git.
4. Open a draft PR and wait for green required CI.
5. Start one Sol reviewer; merge only after exact-head PASS.
6. Mark every worker/reviewer run terminal and then move the ticket to Done.

Never store secrets or credentials in repository files, Notion, GitHub, prompts or run logs. Never commit, push, merge, deploy or perform destructive operations without current authority.
