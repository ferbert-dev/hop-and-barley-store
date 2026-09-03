# Recovery

This migration is additive. Prefer a forward application correction that disables
account-cart lookup while retaining `Cart.userId` and every cart line.

If the ownership schema itself must be removed, first quiesce all cart, login, and
order writers; audit and export every non-null ownership mapping; then run the
following statements in one reviewed transaction:

```sql
ALTER TABLE "Cart" DROP CONSTRAINT "Cart_userId_fkey";
DROP INDEX "Cart_userId_key";
ALTER TABLE "Cart" DROP COLUMN "userId";
```

This preserves carts and cart lines but deliberately removes their account
mapping. Verify row counts before resuming traffic. The disposable O1A PostgreSQL
gate proves both pre-commit atomic rollback and this post-commit recovery shape.
Never reset PostgreSQL, use `db push`, or delete volumes to roll back.
