# O2S forward recovery

O2S preserves every cart, cart line, reservation, order, order item, product,
and stock value. It transitions reservation rows to historical states and adds
database guards that prevent an older runtime from minting new active holds.

## Preflight and deployment order

1. Stop cart and order writes on every instance and drain in-flight requests.
2. Record row counts for `Cart`, `CartItem`, `CartReservation`, `Order`,
   `OrderItem`, and `Product`; record reservation counts by status, the count of
   non-null `CartItem.currentReservationId`, and total `Product.stockAmount`.
3. Apply the migration with the environment's approved secret injection. The
   migration takes write-conflicting table locks, captures database time after
   the locks, changes stale `ACTIVE` rows to `EXPIRED`, changes unexpired
   `ACTIVE` rows to `RELEASED`, clears current pointers, and installs the
   dormant guards in one transaction.
4. Verify the recorded row counts and total stock are unchanged. Verify these
   checks return zero:

   ```sql
   SELECT count(*) FROM "CartReservation" WHERE "status" = 'ACTIVE';
   SELECT count(*) FROM "CartItem" WHERE "currentReservationId" IS NOT NULL;
   ```

5. Deploy only the O2S runtime, prove cart add/update do not change stock or
   create reservations, then prove one disposable Cash on Delivery checkout
   decrements stock and clears its cart atomically before resuming traffic.

Reapplying the data transition is idempotent: after the first successful run it
matches no `ACTIVE` rows and no non-null current pointers. Prisma migration
history still ensures the schema statements run once.

## Abort and rollback boundaries

- Before `COMMIT`, any statement or invariant failure rolls back the complete
  migration. Keep writes stopped, inspect the conflict, and rerun the migration
  unchanged after correction.
- After `COMMIT`, do not redeploy a reservation-writing runtime: the database
  guards intentionally reject it. Roll application code forward instead.
- If reservation behavior must be restored, first keep writes quiesced and ship
  a reviewed forward migration that removes the two dormant guards. Do not turn
  historical `EXPIRED`, `RELEASED`, or `CONSUMED` rows back into `ACTIVE`; a
  compatible runtime must explicitly create new holds after deployment.
- Never edit applied migrations, reset the database, drop reservation history,
  delete volumes, or use `db push`. Restore a backup only to a separate
  diagnostic database; correct shared environments with a forward migration.
