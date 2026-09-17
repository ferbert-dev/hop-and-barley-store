# EUR catalog recovery

The public catalog intentionally selects EUR products. A database whose O2C
migration is already recorded can still contain USD products after writes from
an older runtime or a data import. An empty catalog is not proof of deleted data.
The specific source of the September 17 local drift is unconfirmed.

`20260917100000_reconcile_product_currency_eur` is a forward-only correction:
it locks product writes, rejects unexpected currencies, updates only USD product
currency to EUR, and retains the EUR default. Numeric prices, all other product
fields, carts and historical orders are preserved. Historical migration files
and their ledger entries must not be rewritten.

Before rollout, stop local API writers, take a private database backup, and
record hashes of products excluding currency and all other application tables.
Run the O2C PostgreSQL gate and currency contract tests. Apply the committed
correction with the migration runner, without invoking the seed. Compare the
hashes, restart API/frontend to refresh catalog caches, then verify public
products and euro prices in the browser.

Recovery must use a separately reviewed forward correction based on the backup
and verification results. Never reset the database, delete volumes, reseed the
catalog or relabel historical orders. Do not run old USD seed/runtime images
against the repaired database.
