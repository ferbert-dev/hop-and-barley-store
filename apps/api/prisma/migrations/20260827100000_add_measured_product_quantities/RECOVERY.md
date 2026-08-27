# O2Q recovery boundary

O2Q changes the meaning of live stock, cart, reservation, and order amounts.
After the migration is applied, deploy only an O2Q-compatible API. Runtime
rollback is a forward-only compensating migration; do not run an older
count-only API against the measured schema.

## Backup and preflight

Before applying O2Q, stop cart and order writes, take a database backup, and
record these checks from the same database snapshot:

- row counts for `Product`, `CartItem`, `CartReservation`, `Order`, and
  `OrderItem`;
- product `slug`, `priceMinor`, `priceQualifier`, and `stockQuantity`;
- every live cart item and reservation `productId`, legacy `quantity`, status,
  and current-reservation link;
- each historical order's stored subtotal/total and each order item's
  `unitPriceMinor`, `quantity`, and `lineTotalMinor`.

The migration must abort if a known bulk product's stock multiplication would
exceed 2,000,000,000. Do not work around that guard by truncating stock.

## Deterministic forward conversion

- legacy per-100g cart and reservation rows become `quantity * 100000` mg;
- legacy per-pound cart and reservation rows become
  `max(100000, floor(quantity * 453592 / 100000) * 100000)` mg, keeping the
  result on the 100g order lattice without rounding a hold above its physical
  legacy amount;
- legacy per-100g stock becomes `stockQuantity * 100000` mg;
- legacy per-pound stock becomes `stockQuantity * 453592` mg; stock need not be
  rounded to an order step;
- package and kit counts remain unchanged in `EACH`.

After conversion, active WEIGHT reservations are reconciled against converted
stock in deterministic `reservedAt`, then reservation-ID order. Earlier holds
retain priority. A later hold that exceeds remaining stock is reduced, together
with its current cart line, to the largest valid 100g amount that fits. If less
than the 100g minimum remains, the reservation is marked `RELEASED`, its current
pointer is cleared, and the cart line keeps its desired amount for explicit
recheck. Released history and row identity are preserved. The migration aborts
unless every surviving active hold matches its current line and aggregate
active WEIGHT reservations are within stock.

Historical `OrderItem` rows are not re-priced. The migration preserves their
stored price, amount, and line total by snapshotting the legacy `PACKAGE`,
`EACH`, basis-1 contract. New rows snapshot the product sale kind, amount unit,
price basis, selected amount, and rounded line total.

## Post-migration verification

Verify that `stockQuantity`/`quantity` no longer exist and that `stockAmount`
and `amount` do. For every current cart line, confirm its current reservation
has the same converted amount. Specifically verify representative per-pound,
per-100g, package, and kit rows and check all WEIGHT cart amounts satisfy:

```sql
("amount" - 100000) % 100000 = 0
```

Check that all historical order snapshots still satisfy:

```sql
"lineTotalMinor"::bigint = (
  (2 * "priceMinor"::bigint * "amount"::bigint + "priceBasisAmount"::bigint)
  / (2 * "priceBasisAmount"::bigint)
)
```

Also compare preflight and post-migration row counts, order subtotals/totals,
and reservation-status counts. Seed verification is separate: SafAle must have
11,500mg package net weight, Imperial's weight must remain unknown, the West
Coast kit yield must be 18,927ml, and a representative hop must stock 100kg.

## Recovery limits

Never reset the database, run a destructive Prisma reset, delete Docker
volumes, use `docker compose down -v`, or invent missing physical metadata.
There is no supported down migration because converting measured milligrams
back to legacy counts loses information. If verification fails, keep writes
stopped, restore the pre-migration backup to a separate database for diagnosis,
and ship an audited forward compensating migration that preserves row identity
and historical arithmetic.
