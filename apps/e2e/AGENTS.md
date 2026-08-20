# Hop & Barley Browser Tests

- Follow the root `AGENTS.md`; browser-test work inherits its one-ticket PR, model routing and agent-lifecycle rules.
- Use the `playwright` skill and the ticket-approved target. Local default is `http://127.0.0.1:3000`.
- Assert visible user outcomes and frontend-to-API contracts, not framework internals.
- Await observable application state; never use `networkidle` as the readiness contract.
- Keep tests deterministic, isolated and serial where build/server state is shared. One production build output may have only one active server.
- Use unique run identities and ports. Stop only processes/containers created by the run and prove cleanup.
- Do not mutate production, external services or the shared Compose database from this package.
- Cover relevant connected/unavailable states, keyboard/focus, reflow, reduced motion and serious/critical accessibility regressions proportionally to the ticket.
- Store screenshots, traces, HTML reports, coverage and test results only in ignored temporary paths. Never commit baselines or evidence media unless they are intentional product assets.
- Handoff only a concise result: command group, pass/fail counts, environment, exact head and cleanup. Failed attempts remain visible in CI/Agent Runs.
