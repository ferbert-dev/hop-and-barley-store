# Recovery

This migration is additive. A forward correction can disable account-cart lookup
while retaining `Cart.userId` and every cart line. After writers are quiesced and
all owned carts have been audited, the constraint, index, and nullable column can
be removed in that order. Never reset PostgreSQL or delete volumes to roll back.
