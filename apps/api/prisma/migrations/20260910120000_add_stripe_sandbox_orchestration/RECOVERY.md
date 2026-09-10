# O2P recovery

Disable `STRIPE_PAYMENTS_ENABLED` to stop new Checkout Session creation while
leaving the signed webhook and reconciliation paths available. Keep every
payment attempt, allocation, webhook receipt, discount claim, and order row.

Do not roll this migration back by dropping audit tables after any Sandbox or
provider event has been accepted. Recover active `ALLOCATED`,
`CAPTURE_REQUESTED`, and `RECONCILIATION_REQUIRED` rows against Stripe's
canonical PaymentIntent state before deciding to capture, finalize, or restore
inventory. Never reset the database or replay an uncertain capture with a new
idempotency key.

A cancelled unpaid order remains immutable audit history. The cart may own a
later attempt and order, but the database permits at most one non-cancelled
order for that cart at any time.
