# O1B forward recovery

This migration is additive, but an application version that predates O1B is not
safe while any `CartReservation` row is `ACTIVE`. Its remove and clear paths
delete `CartItem` directly. The reservation foreign key then tries to set
`CartReservation.cartItemId` to `NULL`, which the O1B line-state check rejects
for `ACTIVE` history.

Use this forward transition before deploying a runtime that ignores reservation
fields. It preserves carts, cart lines, products, stock, and reservation
history. It does not drop or reverse the applied schema.

## Ordered operator steps

1. Keep the current O1B runtime available for reads, but stop new cart writes on
   every instance and drain in-flight writes. This includes add, update, remove,
   clear, recheck, and any internal reservation-consume caller. Do not start the
   compatibility runtime yet.
2. From an approved database session, record the output of both preflight
   queries below. Abort if the migration is not present or if reservation writes
   cannot remain quiesced for the whole transition and compatibility deploy.

   ```sql
   SELECT
     to_regclass('public."CartReservation"') IS NOT NULL AS migration_present,
     (SELECT count(*) FROM "Cart") AS carts,
     (SELECT count(*) FROM "CartItem") AS cart_items,
     (SELECT count(*) FROM "Product") AS products,
     (SELECT coalesce(sum("stockQuantity"), 0) FROM "Product") AS total_stock,
     (SELECT count(*) FROM "CartReservation") AS reservations;

   SELECT "status", count(*)
   FROM "CartReservation"
   GROUP BY "status"
   ORDER BY "status";
   ```

3. Execute the following block as one batch with `psql --set ON_ERROR_STOP=1`
   and the environment's approved secret injection. The locks reject an
   undrained writer within five seconds instead of racing it. Database time is
   captured only after both write locks are held. Unswept reservations already
   at their exact expiry become `EXPIRED`; remaining live reservations become
   `RELEASED`. All current pointers are then cleared in the same transaction.

<!-- O1B_COMPATIBILITY_TRANSITION_BEGIN -->

```sql
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
LOCK TABLE "CartItem", "CartReservation" IN SHARE ROW EXCLUSIVE MODE;

DO $o1b_recovery$
DECLARE
  recovery_at timestamp(3) := clock_timestamp()::timestamp(3);
  transitioned_reservations bigint;
  cleared_pointers bigint;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "CartReservation"
    WHERE "status" = 'ACTIVE' AND "reservedAt" > recovery_at
  ) THEN
    RAISE EXCEPTION 'O1B recovery refused: ACTIVE reservation starts after database recovery time';
  END IF;

  UPDATE "CartReservation"
  SET
    "status" = CASE
      WHEN "expiresAt" <= recovery_at
        THEN 'EXPIRED'::"CartReservationStatus"
      ELSE 'RELEASED'::"CartReservationStatus"
    END,
    "releasedAt" = CASE
      WHEN "expiresAt" <= recovery_at THEN NULL
      ELSE recovery_at
    END,
    "consumedAt" = NULL,
    "updatedAt" = recovery_at
  WHERE "status" = 'ACTIVE';
  GET DIAGNOSTICS transitioned_reservations = ROW_COUNT;

  UPDATE "CartItem"
  SET "currentReservationId" = NULL, "updatedAt" = recovery_at
  WHERE "currentReservationId" IS NOT NULL;
  GET DIAGNOSTICS cleared_pointers = ROW_COUNT;

  IF EXISTS (SELECT 1 FROM "CartReservation" WHERE "status" = 'ACTIVE') THEN
    RAISE EXCEPTION 'O1B recovery refused: ACTIVE reservations remain';
  END IF;
  IF EXISTS (
    SELECT 1 FROM "CartItem" WHERE "currentReservationId" IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'O1B recovery refused: current reservation pointers remain';
  END IF;

  RAISE NOTICE 'O1B recovery transitioned % reservations and cleared % pointers at %',
    transitioned_reservations, cleared_pointers, recovery_at;
END
$o1b_recovery$;

COMMIT;
```

<!-- O1B_COMPATIBILITY_TRANSITION_END -->

4. While writes are still quiesced, repeat the preflight count query and run the
   verification query below. Cart, cart-item, product, total-stock, and
   reservation counts must exactly match the recorded values; both verification
   values must be zero. Re-running the transition is safe and changes no rows.

   ```sql
   SELECT
     count(*) FILTER (WHERE "status" = 'ACTIVE') AS active_reservations,
     (SELECT count(*) FROM "CartItem"
       WHERE "currentReservationId" IS NOT NULL) AS current_pointers
   FROM "CartReservation";
   ```

5. Deploy the compatibility runtime while cart writes remain quiesced. Using a
   designated disposable/canary cart, prove that removing one line and clearing
   multiple lines both succeed. Confirm health and error telemetry, then resume
   cart traffic. Never use an existing customer cart for this smoke test.

## Abort and rollback boundaries

- Before `COMMIT`, a lock timeout, statement timeout, future-dated active row,
  or invariant failure aborts the batch and PostgreSQL rolls back every change.
  Keep writes quiesced, inspect the conflicting session or data, and rerun the
  entire block; do not continue to the compatibility deploy.
- After `COMMIT`, do not turn released or expired history back into `ACTIVE`.
  If the compatibility deploy cannot proceed, keep writes quiesced and restore
  the O1B runtime. Existing cart lines remain present and its explicit recheck
  operation can acquire fresh reservations before traffic resumes.
- Leave `CartReservation`, `CartItem.currentReservationId`, constraints, and
  history in place. Correct schema or data with a new forward migration after
  inspection. Do not edit the applied migration, reset a database, drop shared
  data, or use `db push`. Before any later destructive cleanup, prove that no
  deployed version reads these fields and take the environment's approved
  backup.
