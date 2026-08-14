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

The builder's evidence submission and the reviewer's required set are separate
inputs. The reviewer derives the required set directly from the ticket,
architecture and acceptance contract before reading the submitted ledger. The
four-part key is `requirementId + state + check + channel`. Closure requires
exact equality: no missing, duplicate or unexpected mapping.

Each passing record must point to a durable machine-readable result as
`path/to/report.json#record-id`. The referenced record contains the exact
command or test name, outcome, execution mode, UTC start/finish, Node and pnpm
versions, and the state/check/channel mapping it proves. A source file,
instruction page, checklist, console summary or screenshot filename alone is
not closure evidence.

Evidence is fail-closed:

- `pass` requires a non-empty durable artifact reference and valid UTC
  timestamp.
- `not-applicable` requires a null artifact, a precise non-empty reason and a
  reviewer-agreement trace. It is never generated merely because a test was not
  run.
- `pending`, `not-run`, `blocked` and `fail` never close a mapping.
- Manual work closes only from a completed review result. A checklist or a
  `not-reviewed` observation remains pending.
- Invalid attempts remain visible as non-closing run records. A later passing
  rerun does not rewrite the earlier result.

The machine-readable policy is
[`docs/engineering-workflow.contract.json`](engineering-workflow.contract.json).
`pnpm workflow:check` derives its expected rule IDs independently and rejects a
missing, duplicated or weakened rule. It also recomputes the machine-policy
digest so changing a nested value cannot bypass the explicit field assertions.

Architecture state for this retrospective:

- **Implemented:** the accepted combined tree has the root `StorefrontShell`,
  D3 web-local UI primitives and the generated OpenAPI client; source paths are
  checked by `workflow:check` when that combined tree is present.
- **Decided:** the evidence, isolation, integration and promotion rules in this
  document apply before C2 review.
- **Proposed:** none; R1 does not select a new service, package or deployment
  provider.
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

Before combined review, the integrator produces a manifest from the actual
patch, not an intended file list. It includes:

- base and target Git object IDs plus every changed, added, deleted or renamed
  path;
- per-file text line counts and the owner slice for collision-prone files;
- dependency manifest changes and the exact lockfile line delta;
- every binary path with byte size, SHA-256, dimensions/type where applicable,
  provenance, prior hash if it existed and the review method;
- exact commands, run-report paths, UTC timestamps and cleanup evidence.

The independent reviewer recomputes path equality and binary hashes. Visual
assets additionally need an enforced visual threshold and a completed visual
review result. If bytes changed within an approved threshold, record the real
change; never describe regenerated bytes as preserved.

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

### C2 catalog integration gate

C2 may extend the NestJS/OpenAPI contract, but any C2 web surface must reuse the
accepted D3 `ProductCard`, `Price`, `LoadingState`, `EmptyState` and `ErrorState`
exports. It must call the generated `@hop-and-barley/api-client` client rather
than define a raw-fetch DTO contract. A third product-card implementation or a
second hand-written transport type fails review.

Source-review paths are fixed in the contract:

- `apps/web/src/components/ui/card.tsx#ProductCard`
- `apps/web/src/components/ui/price.tsx#Price`
- `apps/web/src/components/ui/status.tsx#{LoadingState,EmptyState,ErrorState}`
- `packages/api-client/src/client.ts#createApiClient`
- `packages/api-client/src/generated/schema.ts#paths`

The C2 owner checks these imports before implementation and the independent
reviewer repeats the source audit. Rollback removes only the new C2 adapter/UI
slice and preserves the accepted D3 primitives and generated client.

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

D2's evidence changed from a mechanical 108-pass ledger with invented or
source-only references to 62 backed passes plus 46 precise reviewer-approved
N/A records. Its visual proof changed from unenforced captures to eleven hashed
and dimension-checked baselines. The integrated review then reported web 80/80,
API 18/18, PostgreSQL 11/11 and connected/unavailable Chromium 10/10 each, with
zero generated client drift.

For C2 and the next cluster, measure these gates before requesting review:

- 100% exact equality between independently derived and submitted evidence
  mappings; zero duplicate, invented, missing or non-closing records;
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
