# Engineering workflow

Work flows from an outcome to an Epic when needed, then to decision-complete
tickets. A ticket moves Inbox → Ready → In Progress → Review → Done; use
Blocked, Won't Do, or Archive only with a recorded reason.

Ready requires one outcome, primary role, dependencies, acceptance criteria,
risks, verification, rollback and required authority. Builders work in a
focused branch and provide evidence. A separate reviewer returns PASS, FAIL or
BLOCKED before closure.

Trace completed engineering as: Notion Epic/Ticket/Agent Runs → Git
branch/PR/CI → repository code/tests/docs.

## Evidence boundary

Use repository code, tests, migrations and Git history for implementation
facts. Use Notion for intent, tickets, decisions, roles and Agent Runs. Use
GitHub for review, CI, merge and deployment evidence. A blueprint or checklist
describes an expectation; it is not proof that the expectation passed.

The builder records one concise verification summary: changed paths, relevant
test groups, cleanup result, exact head SHA and links to the required GitHub
checks. The independent reviewer derives the required checks from the ticket
and architecture, reviews the exact head and records `PASS`, `FAIL` or
`BLOCKED`. A new head invalidates the prior verdict.

Do not commit or upload Playwright screenshots, traces, reports, coverage
outputs or generated per-test evidence ledgers. They are temporary diagnostics
only. Runtime images and other intentional product assets remain tracked with
their normal source manifest. Failed CI and review attempts remain visible in
GitHub/Notion; they are not rewritten as passes.

The machine-readable policy is
[`docs/engineering-workflow.contract.json`](engineering-workflow.contract.json).
`pnpm workflow:check` derives its expected rule IDs independently and rejects a
missing, duplicated or weakened rule. It also recomputes the machine-policy
digest so changing a nested value cannot bypass the explicit field assertions.

## Cost-aware multi-model orchestration

The root [`AGENTS.md`](../AGENTS.md) is the sole source of truth for the worker
concurrency limit. Read it before delegation; this document intentionally does
not duplicate a numeric worker limit.

One root orchestrator owns one vertical scope, its integration, pull request and
final status. There is no standing agent pool. A worker is stopped or reused
immediately after handoff, and a second vertical scope waits until the current
PR is merged or explicitly Blocked.

Model selection is explicit on every delegation:

| Model           | Default work                                                                                  | Escalation boundary                                                          |
| --------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `gpt-5.6-sol`   | architecture, security-sensitive changes, risky cross-cutting work, exact-head closure review | authoritative fallback whenever correctness, trust, data or scope is unclear |
| `gpt-5.6-terra` | routine feature implementation, medium-complexity fixes and integration                       | escalate to Sol when the task crosses an uncertain boundary                  |
| `gpt-5.6-luna`  | bounded mechanical edits, fixtures, repetitive tests, inventories and documentation           | escalate when judgment or architecture becomes material                      |

The delegating Agent Run records model, reasoning effort and one sentence
explaining the cost/correctness choice. A worker may return uncertainty instead
of stretching its scope. That uncertainty routes upward; it is never silently
reassigned downward to save cost.

Only one independent reviewer runs, using Sol, after required CI is green. The
review is exact-head and read-only. A changed head or failed check invalidates
the verdict and requires a fresh review after correction.

Architecture state after the catalog retrospective:

- **Implemented:** C1, C2 and C3 are merged. The catalog has deterministic
  PostgreSQL fixtures, a bounded NestJS/OpenAPI contract, a generated client,
  server-rendered URL state, query-specific public caching and responsive UI.
- **Decided:** one ticket owns one branch and one pull request. Merge requires
  green required CI plus an independent PASS for the exact head SHA; only then
  may the ticket move to Done.
- **Decided:** feature branches keep executable assertions and a concise
  PR/Agent Run summary; generated evidence reporters and retained test media are
  unnecessary for this repository.
- **Unknown/pending:** the exact auth/admin route-group and layout ownership is
  intentionally blocked on its dedicated architecture decision.

## Isolated verification

Every runtime proof records its worktree, build-output directory, bound port,
process/container identity and cleanup result. The builder owns cleanup before
requesting review; the reviewer verifies it before closure.

### Next.js build and server isolation

One production build output may have at most one active `next start` process.
Never run concurrent servers against one `.next` directory: a build or server
can replace manifests used by the other process. Use one of these strategies:

1. Serialize `build → start → test → stop` for each environment mode; or
2. configure a distinct build-output directory for every concurrent server,
   then give each server a unique port.

Connected and unavailable API modes may share test definitions, but they must
not share a mutable build directory while either server is running. Start a
server only after its build completes, prove readiness, run the bounded suite,
stop that exact process and record cleanup. A failed or invalidated run is not
relabelled as passing.

Rollback: stop only the process identified by the run record, discard that
isolated output and rerun serially. Do not kill unrelated local development
processes.

### PostgreSQL isolation

Migration, seed, rollback and concurrency evidence uses a disposable PostgreSQL
container/database identified by the ticket and run ID. It has a unique Compose
project or container name, port and disposable data location. Review work never
reuses or mutates the shared `compose.yaml` development stack.

The run must prove readiness, migration/seed assertions, rollback behavior and
cleanup of only the disposable resources it created. Never use
`docker compose down -v`, volume deletion or a reset command against the shared
stack. If cleanup cannot be proven, the evidence remains blocked and the shared
environment is left untouched.

### Allowlisted workspace cleanup

`pnpm clean` delegates only to
`scripts/clean-workspace-artifacts.mjs`. The cleaner verifies the repository
root identity, rejects non-canonical roots, absolute/traversing paths and
symlink components, then removes only its fixed relative allowlist. The list is
machine-checked against `engineering-workflow.contract.json` and covers the web
`.next` directory, current app/package `dist` and `tsconfig.tsbuildinfo`
outputs, and the ignored Prisma client under
`apps/api/src/generated/prisma`.

The cleaner has no glob, arbitrary-path or environment-variable input. Its
tests create sentinels inside a disposable temporary repository, prove every
allowlisted sentinel is removed and prove unrelated files survive. Delegated
review must never exercise the destructive cleaner against main or a working
feature worktree.

## Integration closure

The integrator owns the combined-tree gate after independently closed slices
are assembled and before the combined patch enters review. Run it from a fresh
isolated worktree with the repository-declared Node 24 and pnpm version.

Do not accept replayed Turbo cache output as integration proof. The clean-order
sequence is:

1. `pnpm install --frozen-lockfile --ignore-scripts`
2. `pnpm clean`
3. `pnpm generated:verify`
4. `pnpm exec turbo run typecheck --force`
5. `pnpm format:check`
6. `pnpm exec turbo run lint test:unit build --force`
7. run ticket-specific disposable PostgreSQL and isolated Playwright suites

Typecheck deliberately precedes build after cleanup so generated build output
cannot hide a clean-checkout type dependency.

`pnpm generated:verify` does not compare generated files with `HEAD`. That is
invalid when OpenAPI is ignored/missing and the accepted generated client is
already part of a dirty combined patch. Instead it:

1. snapshots the existing generated-client bytes;
2. generates once, requires both OpenAPI and client, and requires the client to
   equal its accepted pre-run snapshot;
3. snapshots both first-generation outputs;
4. generates a second time and requires byte equality with the first outputs.

On failure it restores the pre-run client/OpenAPI state. A first-pass client
change belongs to the API-owning ticket; a second-pass change is generator
nondeterminism. Neither can close through a prose waiver.

### Reviewed patch and binary manifest

Before review, the owner inspects the actual patch, not an intended file list.
The concise summary records the base/head SHA, changed paths, dependency and
lockfile deltas, relevant checks and cleanup result. If intentional runtime
binary assets change, record their byte size, hash, provenance and review
method. Test screenshots, traces, reports and generated evidence files are not
valid patch contents.

The independent reviewer recomputes the path boundary, confirms any intentional
runtime binary changes and rejects unrequested generated output. No per-test
manifest is committed to the feature branch.

Rollback: reject the combined patch, restore the last independently approved
slice set, rebuild the manifest and rerun the full uncached sequence. Do not
silently drop another slice's edits from a shared file.

## Ownership gates for upcoming slices

### Route and layout ownership before auth or admin

The accepted storefront shell currently sits in the root layout, so a newly
added auth or admin route would inherit it automatically. Before the first auth
or admin implementation ticket enters In Progress, the architect must record a
decision that maps every planned route family to its owning layout and states
whether storefront chrome is inherited, nested or excluded.

The decision must include the route-group tree, authentication boundary, error
and loading ownership, active-navigation behavior, tests and rollback. Until it
exists, auth/admin route creation is blocked. Verification is a route-tree and
landmark test proving each family receives exactly its declared layout.

Rollback: remove only the new route group/layout wiring and return to the
approved storefront-only root layout; do not duplicate the shell inside route
pages.

### Promote a cross-workspace contract on the second consumer

The first consumer owns a contract locally. Move it to `packages/*` only when a
second independent workspace needs the same stable API. The promotion ticket
must name both consumers, ownership, compatibility policy, dependency direction
and tests. Do not create a shared package for hypothetical reuse.

The generated OpenAPI client is already the API/web contract and remains the
only cross-workspace catalog transport. Web code must not import backend source.
UI primitives remain in `apps/web` while the web app is their only workspace
consumer.

Rollback: keep or return the contract to the first consumer until two real
consumers and a stable boundary are demonstrated.

### Accepted catalog integration boundary

The accepted catalog web surface reuses `ProductCard`, `Price`, `LoadingState`,
`EmptyState` and `ErrorState`, and calls the generated
`@hop-and-barley/api-client` client. Future product and cart work preserves this
boundary: a third product-card implementation or a second hand-written catalog
transport type fails review.

Source-review paths are fixed in the contract:

- `apps/web/src/components/ui/card.tsx#ProductCard`
- `apps/web/src/components/ui/price.tsx#Price`
- `apps/web/src/components/ui/status.tsx#{LoadingState,EmptyState,ErrorState}`
- `packages/api-client/src/client.ts#createApiClient`
- `packages/api-client/src/generated/schema.ts#paths`

The owning feature builder checks these imports before implementation and the
independent reviewer repeats the source audit. Rollback removes only the new
feature adapter/UI slice and preserves the accepted primitives and generated
client.

## R1 measured retrospective

The values below are review evidence from 14 August 2026, not delivery targets
invented after the fact.

| Slice                  | First independent result                                                   | Final result                                                                | Observed correction interval |
| ---------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- | ---------------------------: |
| C1                     | FAIL: one rollback-atomicity finding                                       | PASS with disposable PostgreSQL rollback proof                              |                   17 minutes |
| D3                     | FAIL: four UI/runtime/token findings                                       | PASS after exact Node/Chromium reproductions                                |                   18 minutes |
| D2                     | FAIL: five shell/evidence findings, then one evidence-truthfulness finding | PASS: 108/108 mappings, 62 durable pass and 46 reviewed N/A                 |                   72 minutes |
| Integrated D1/C1/D2/D3 | Review started only after selective integration                            | PASS: direct uncached Node24, clean-order, PostgreSQL and two browser modes |    10 minutes review runtime |

Review provenance:

- C1: [initial rollback finding](https://app.notion.com/p/3bcd78850eab81a28ebfc496365e777e?pvs=204)
  → [repeat PASS](https://app.notion.com/p/3bcd78850eab81c98116e1975cf7f1f5?pvs=204)
- D3: [initial four findings](https://app.notion.com/p/3bcd78850eab8118bdf8edb860a27526?pvs=204)
  → [repeat PASS](https://app.notion.com/p/3bcd78850eab81d191cae28edc80545a?pvs=204)
- D2: [initial five findings](https://app.notion.com/p/3bcd78850eab8191aacbdb3145e64d0d?pvs=204)
  → [evidence-truthfulness finding](https://app.notion.com/p/3bcd78850eab819b8710db5b5c1277ea?pvs=204)
  → [final PASS](https://app.notion.com/p/3bcd78850eab811d9440defc7ca82ba1?pvs=204)
- Combined tree:
  [integrated PASS](https://app.notion.com/p/3bcd78850eab81e1b507c8f370a400e4?pvs=204)

D2's historical correction replaced a mechanical ledger with verified browser
and unit assertions before merge. Q3 later retired the retained screenshots and
generated ledger files; their useful semantic, responsive, focus, Axe and
reduced-motion checks remain executable. The integrated review reported web
80/80, API 18/18, PostgreSQL 11/11 and connected/unavailable Chromium 10/10
each, with zero generated client drift.

R1 established these gates for C2 and the catalog cluster:

- exact-head required checks and an independent reviewer verdict before merge;
- one or fewer active production servers per build output and zero shared
  Compose resources touched by review;
- direct Node 24 uncached gates pass from clean order with zero generated diff;
- the reviewed patch manifest covers 100% of changed paths and binary files;
- a route/layout decision exists before auth/admin starts;
- zero new cross-workspace package contracts without two named consumers;
- C2 introduces zero third product cards and zero hand-written catalog transport
  contracts.

The primary ticket owner collects the measurements, the integrator checks the
combined tree and the independent reviewer recomputes them. A missed target does
not get waived in prose: return the owning ticket to In Progress, preserve the
failed evidence and apply the rollback stated above.

## R2 measured catalog retrospective

R2 was triggered after C1, C2 and C3 reached Done. Repository source, tests,
migrations and Git history define the implemented baseline; linked Notion Agent
Runs define review results and timestamps. The ignored HTML reference bundle is
not reproducible from a clean clone, so its original 12-card, 12-detail and
95-specification comparison remains accepted review evidence rather than a new
claim.

### Measured baseline

| Slice | Implemented result                                                                                        | Review feedback                                                                                               | Final result                                                                    |
| ----- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| C1    | 5 categories, 12 deterministic USD products, forward migration and seed                                   | First review found non-atomic structural rollback                                                             | Corrected and independently reproduced from disposable PostgreSQL in 17 minutes |
| C2    | Bounded query grammar, one `RepeatableRead` count/items/facets transaction, OpenAPI client and web bridge | Closure exposed legacy discriminator, clean-dist startup, Docker-context and README drift                     | Four bounded corrections, 7-minute integration and 5-minute combined review     |
| C3    | Server-rendered URL state, five catalog states, 60-second public cache and responsive catalog             | Two green-CI heads still failed independent review because named tests did not yet assert every claimed state | Exact head `08d1547` passed after the missing semantic assertions were added    |

Both foundation PR #1 and catalog PR #2 needed six commits. PR #1 took 91
minutes 44 seconds from open to merge; PR #2 took 2 hours 43 minutes 3 seconds.
The useful failures were atomic rollback, clean prerequisites, Linux rendering,
bounded unavailable behavior and exact assertion coverage. The expensive
failure mode was discovering evidence and platform prerequisites only after a
review-ready head had been published.

### Keep

- Keep disposable PostgreSQL fresh/upgrade/double-seed, concurrency and injected
  rollback-failure proofs whenever schema, migration, seed or stored data change.
- Keep NestJS DTO → OpenAPI → generated client as the only API/web catalog
  transport, plus two-pass generated-byte stability and strict rollback
  compatibility.
- Keep query-specific public catalog caching at 60 seconds, the 1-second backend
  request bound, failed-response non-caching and immediate recovery. Private
  auth, cart and order responses remain `private, no-store`.
- Keep isolated connected/unavailable runtime tests, direct responsive box,
  focus, state and accessibility assertions, and explicit cleanup.
- Keep independent exact-head review: it prevented two false C3 merges even when
  CI was green.

### Change

One ticket now owns one `codex/<ticket>-<slug>` branch and one draft pull
request based on `main`. The required order is Ready ticket → Running Agent Run
→ branch → commit → draft PR → green required CI → exact-head independent
review → ready PR → merge → Done. A new commit invalidates the prior PASS and
requires a new review run.

After a FAIL, preserve the failed Agent Run and use one bounded correction
bundle by default. Rerun the affected local proof plus package checks, then let
full exact-head CI remain the merge gate. Do not keep one reviewer run open
across multiple heads and later relabel it Succeeded.

State-specific assertions and independent exact-head review remain
authoritative. A test name or source path is navigation, not semantic proof.
Browser checks wait for observable application state; `networkidle` is
forbidden. Flaky checks must be stabilized before they can support a PASS.

Whenever catalog query grammar changes, one table-driven vector set must pass
through the API and web parsers with identical valid, invalid, default and
canonical classifications. This is a change-triggered test, not a reason to add
a speculative shared runtime package now.

### Conditional verification tiers

Every ticket records changed paths, relevant tests, CI, cleanup and exact head
SHA. Run additional checks only when the patch creates the corresponding risk:

- PostgreSQL for schema, migration, seed or stored-data changes;
- Playwright for user-flow or browser-state changes;
- browser and manual review for changed layout or manual-only risk;
- the full binary/dependency manifest for binary, lockfile, dependency or
  multi-slice integration changes.

Ticket-specific behavior such as cache isolation remains an explicit acceptance
criterion. A substantive finding always blocks merge regardless of which tier
selected the check.

### Retire

- Retire selective multi-slice integration when a dedicated ticket PR can own
  the change directly.
- Retire hand-written automated PASS rows, generated evidence ledgers and
  retained test screenshots/traces/reports.
- Retire routine full PostgreSQL, browser or binary checks for
  documentation-only corrections while keeping full exact-head CI before merge.

### P1, O0 and O1 experiment

P1 and O0 may proceed in parallel only in separate branches and pull requests.
O1 starts from merged O0 and also owns a dedicated PR. R3 measures the three
deliveries against this catalog baseline:

- 3/3 tickets have their own branch and PR; zero tickets reach Done before merge;
- zero review requests have red required CI;
- zero claimed behaviors lack state-specific semantic assertions;
- target no more than three CI runs and two exact-head reviews per ticket, while
  every substantive finding still blocks merge;
- zero generated drift, shared-Compose mutation or uncleaned isolated resource.

The primary owner records the concise outcome in the ticket and Agent Run. The
independent reviewer verifies exact-head traceability and the selected checks.
Rollback removes only the workflow-policy delta and keeps all accepted catalog
runtime/data behavior unchanged.
