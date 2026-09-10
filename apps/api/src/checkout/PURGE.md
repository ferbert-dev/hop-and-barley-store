# Expired guest checkout draft purge

Run `pnpm --filter @hop-and-barley/api checkout:purge-expired-drafts` from an
authorized API environment when the retention job is scheduled operationally.
O2G deliberately adds no hosting-provider scheduler. The command fixes one UTC
cutoff at startup and deletes in bounded 100-row statements using
`FOR UPDATE SKIP LOCKED`, so concurrent workers cannot select the same row.
Output contains only the cutoff and aggregate deleted count.

The deletion predicate is intentionally narrow. A row must be guest-owned,
`PRE_PAYMENT`, and at or beyond its absolute 24-hour capability expiry. A draft
whose cart has an `Order` or which owns a `PaymentAttempt` is excluded even if
those other predicates match. Deleting a qualifying draft cascades only to its
`CheckoutDraftRequest` replay
snapshots. The cart, cart items, products, users, orders, order items, inventory,
payment attempts, claims, and reservation history are not deletion targets.
The payment-attempt foreign key is also restrictive, so financial history is
retained even if the purge predicate regresses.

Before enabling a recurring invocation, verify the command against a disposable
PostgreSQL database and record only candidate counts. Disable or stop the job to
roll back the lifecycle behavior; no schema rollback is required. A completed
purge intentionally cannot restore expired pre-payment PII or its replay
snapshot. Recovery is for the guest to restart checkout from the preserved cart.
Do not make expired capabilities valid, delete carts or orders, reset PostgreSQL,
or remove a volume in an attempt to recover purged rows.
