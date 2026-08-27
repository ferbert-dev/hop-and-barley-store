# ADR 0002: Keep cart intent separate from inventory allocation

- **Status:** Accepted — O2S replacement contract, implementation pending verification
- **Date:** 2026-08-27
- **Decision owner:** O2S root orchestrator
- **Scope:** Measured-product amounts, cart intent, checkout-readiness advice, and final order allocation

## Context

The former cart contract made a cart mutation create, renew, and expose a stock
reservation. That coupled an editable shopping intent to a short-lived inventory
hold, introduced a countdown and recheck flow, and made a product's on-hand
stock an upper bound for each cart edit. It also made two independent cart lines
compete before an order existed.

The checkout contract needs a clear boundary instead:

- Cart edits express customer intent and must not allocate inventory.
- A lightweight check may advise whether the current cart can proceed, but it
  cannot promise allocation or disclose operational inventory data.
- The final order transaction is the sole allocation point.

## Decision

### Amounts and sale rules

Every product has a `saleKind`, canonical `amountUnit`, price basis, minimum,
step, and nullable explicit maximum. The API owns validation and price
calculation; the storefront formats and edits a selected amount.

| Sale kind | Canonical amount   | Cart rule                                                                                                  |
| --------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| `WEIGHT`  | integer milligrams | 0.1 kg (100,000 mg) steps from 0.1 kg through 100 kg, unless the product declares a lower explicit maximum |
| `PACKAGE` | integer `EACH`     | configured integer minimum and step; no maximum is invented                                                |
| `KIT`     | integer `EACH`     | configured integer minimum and step; no maximum is invented                                                |

Each distinct weight product/cart line has its own 100 kg ceiling (or lower
explicit product maximum). On-hand stock and another line's amount do not
reduce that ceiling. There is no aggregate cart-weight ceiling.

Prices retain the integer calculation:

```text
roundHalfUp(priceMinor * selectedAmount / priceBasisAmount)
```

No floating-point calculation is authoritative for money.

### Cart is non-reserving intent

Adding, updating, removing, clearing, or reading a cart does not create,
renew, consume, decrement, or otherwise hold stock. Cart amount validation is
limited to the product's sale-rule lattice and product availability needed to
accept the intent; it does not compare the amount with on-hand stock.

The cart response and public UI do not expose reservation state, reservation
expiry, server countdown time, or inventory pointer. There is no cart-wide
recheck endpoint or button. Exact stock disclosure in existing product/cart
contracts remains separately owned by SEC4; readiness itself never exposes it.

### Advisory checkout readiness

`POST /api/v1/cart/checkout-readiness` is private and `no-store`. It is an
advisory, non-mutating request. It neither creates a cart as a side effect nor
changes cart lines, reservations, inventory, prices, orders, or checkout state.

Its response is intentionally small:

```ts
{
  status: 'ready' | 'empty' | 'unavailable';
  checkedAt: string; // ISO-8601 date-time
  lines: Array<{
    productSlug: string;
    requestedAmount: number;
    outcome:
      | 'available'
      | 'insufficient_stock'
      | 'product_unavailable'
      | 'invalid_amount'
      | 'price_unavailable';
  }>;
}
```

`ready` has only `available` line outcomes. `empty` has no lines. `unavailable`
has a line outcome for every retained line, including `available` results for
lines that did not fail. The response never contains exact stock, internal
identifiers, reservation data, provider/supplier data, delivery promises, or
operational failure details.

The browser presents a stable `Checking availability…` pending state. A ready
response navigates to `/checkout`. An unavailable response keeps the cart and
all controls intact, exposes `Availability needs attention`, and annotates each
failed line accessibly:

| Outcome               | Customer-facing annotation                   |
| --------------------- | -------------------------------------------- |
| `product_unavailable` | `This item is no longer available.`          |
| `insufficient_stock`  | `This amount is not currently available.`    |
| `invalid_amount`      | `Choose a valid amount for this item.`       |
| `price_unavailable`   | `This item cannot be checked out right now.` |

A transport failure is recoverable and generic: `We couldn’t check
availability. Try again.` Restoring and activating the primary checkout action
performs a fresh one-shot check; there is no separate recheck control.

### Final order placement allocates atomically

Cash on Delivery is the only order-placement method in this slice. The final
order transaction, not readiness, locks all involved products in a deterministic
order, then revalidates product availability, selected amount, price, and stock.
It decrements stock, creates the order and order-item snapshots, and clears the
cart atomically. A single last-stock unit therefore has exactly one successful
buyer; a losing buyer keeps their cart unchanged for correction or retry.

Allocation occurs before payment success. Stripe and other provider
orchestration are future work and must not be implied by this decision.

### Reservation-schema cutover

The reservation tables/columns are retained dormant-first to preserve history.
The cutover migrates any live cart pointers away from active reservation state
and adds guards that prevent future `ACTIVE` reservations and future cart
reservation pointers. Historical rows remain auditable; no new cart or order
path may rely on them.

## Consequences

Positive consequences:

- Cart editing is stable and has no expiration race or stock-cap surprise.
- An advisory response is safe to retry and reveals no operational inventory.
- Only the final transaction decides allocation, making the last-stock race
  explicit and testable.

Negative consequences:

- A ready check is not a stock promise; availability can change before order
  placement.
- A customer may need to correct a retained cart after readiness or a final
  allocation conflict.
- Historical reservation storage remains until a separately approved archival
  decision.

Supplier/backorder sourcing and fast/delayed delivery promises are explicitly
out of scope.

## Alternatives rejected

| Alternative                                     | Reason rejected                                                                           |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Cart-time reservations with renewals/countdowns | Couples browsing to scarce inventory and creates expiry/recheck races.                    |
| Clamp each cart line to on-hand stock           | Makes intent state volatile and prevents independent measured selections.                 |
| Aggregate cart weight ceiling                   | Mixes unrelated products and has no approved product rule.                                |
| Readiness that reserves or decrements stock     | Misrepresents a check as allocation and makes retries unsafe.                             |
| Payment-provider work in this slice             | The ticket authorizes COD allocation only; provider orchestration needs its own boundary. |

## Verification and rollback

Verification must cover:

- sale-rule validation, including two independent weight lines and the 100 kg
  per-line limit;
- private/no-store, non-mutating readiness results and safe response fields;
- ready navigation, unavailable-line preservation, generic transport recovery,
  pending/accessibility/keyboard/reflow behavior; and
- disposable PostgreSQL proof that final deterministic locking admits exactly
  one last-stock buyer, rolls back partial failure, clears only the winner's
  cart, and does not create new active reservations or pointers.

Before merge, rollback is discarding the ticket branch. After deployment,
rollback needs a reviewed compensating migration and application rollback that
preserve orders and historical reservation data. Database resets, force-push
schema commands, volume deletion, or restoration of cart-time reservations are
not permitted.
