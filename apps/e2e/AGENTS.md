# Hop & Barley Browser Tests

- Read the repository-root `AGENTS.md` before changing browser tests.
- Use the `playwright` skill and run tests against the live local stack at `http://127.0.0.1:3000` unless a ticket explicitly names another authorized target.
- Assert visible user outcomes and critical frontend-to-API integration, not implementation details.
- Keep tests deterministic and independent. Do not mutate production or an external environment from this package.
- Store generated screenshots, traces, and reports only in ignored test-output paths.
