# ADR 0002: Model sellable amounts explicitly

- **Status:** Accepted — implemented and verified, pending merge
- **Date:** 2026-08-27
- **Decision owner:** O2Q root orchestrator
- **Ticket:** [O2Q — Implement measured product quantities and transparent yields](https://app.notion.com/p/3c9d78850eab8142bc05e8e1be2afc9f)
- **Agent Run:** [Orchestrator — O2Q measured product quantities](https://app.notion.com/p/3c9d78850eab8188b39ce53dfeb3d0b1)
- **Scope:** Catalog sale rules, cart reservations, checkout snapshots, and their storefront representation

## Decision summary

Hop & Barley will not treat every cart value as a dimensionless item count.
Each product declares one sale kind and an exact integer amount unit:

| Sale kind | Canonical amount unit | Meaning                                                            |
| --------- | --------------------- | ------------------------------------------------------------------ |
| `WEIGHT`  | `MILLIGRAM`           | Bulk ingredients sold by physical weight                           |
| `PACKAGE` | `EACH`                | Manufacturer or store packages sold as indivisible units           |
| `KIT`     | `EACH`                | Recipe kits sold as indivisible units with an optional batch yield |

The API and PostgreSQL own amount validation, inventory, reservations, pricing,
and order snapshots. The web app formats and edits those values but is not the
authority for totals.

`Product.priceMinor` is the price for `Product.priceBasisAmount`, expressed in
the product's canonical amount unit. The authoritative line price is:

```text
roundHalfUp(priceMinor * selectedAmount / priceBasisAmount)
```

The calculation uses integer/BigInt-safe arithmetic before narrowing to a
validated currency-minor-unit result. Floating-point arithmetic is not used for
money.

## Product sale-rule contract

Every product exposes:

- `saleKind`
- `amountUnit`
- `priceBasisAmount`
- `minimumOrderAmount`
- `orderStepAmount`
- nullable `maximumOrderAmount`
- `stockAmount`
- nullable `packageNetWeightMg`
- nullable `kitYieldVolumeMl`

`priceQualifier` remains a display-compatible description during the O2Q
migration, but it is not parsed and is never a business-rule input.

The initial rules are:

- Bulk products use `MILLIGRAM`, a 100,000 mg price basis, a 100,000 mg minimum,
  and a 5,000 mg validation step. The UI plus/minus affordance moves by 100,000
  mg; direct entry may use any valid 5 g-aligned amount, including 155 g.
- Packages and kits use `EACH` with basis, minimum, and step equal to one.
- A nullable maximum means that stock is the current effective ceiling. When a
  maximum exists, both the configured maximum and available stock apply.
- Known package net weight is metadata, not the purchased amount unit. An
  unknown pouch weight remains null and must not be guessed.
- Kit yield is stored in integer millilitres per kit. The UI may present the
  aggregate in familiar gallons and approximate litres; the stored quantity
  remains a kit count.

The API request field and persistence column are named `amount`. For a weight
product it contains milligrams; for a package or kit it contains an integer
unit count. Cart responses expose `distinctItemCount`; they do not sum
incompatible physical dimensions into a `totalQuantity`.

## Why integer milligrams

Grams are the primary storefront unit, but the approved 5 g step and possible
future package metadata require an exact, currency-independent base unit.
Integer milligrams avoid decimal database and JSON ambiguities, retain exact
round trips, and leave room for more precise catalog metadata without changing
the contract. The UI converts explicitly:

```text
grams = milligrams / 1,000
kilograms = milligrams / 1,000,000
```

The UI accepts grams or kilograms and normalizes to milligrams before calling
the API. Validation messages remain in the unit selected by the customer.

## Inventory, cart, and order invariants

1. Stock and reservations use the same canonical amount unit as the product.
2. A cart mutation is valid only when the amount is at least the minimum,
   aligned to the configured step, no greater than the optional maximum, and no
   greater than currently available stock.
3. Reservation changes and checkout stock decrements use the exact canonical
   amount; no gram/kilogram conversion happens inside inventory arithmetic.
4. The server recalculates every cart and order line from the current product
   price and basis. Client totals are informational only.
5. An order item snapshots its sale kind, amount unit, price, price basis,
   selected amount, qualifier, and line total. Later catalog changes cannot
   rewrite the commercial meaning of an existing order.
6. The cart badge counts product lines. Cart and order totals add money only,
   never the heterogeneous amount values themselves.

## Migration and compatibility

The migration is append-only and transactional. Live catalog, cart,
reservation, and order columns move from the ambiguous `quantity` and
`stockQuantity` names to `amount` and `stockAmount`, with database constraints
matching the new integer bounds.

Legacy per-100g cart and reservation counts are multiplied by 100,000 mg.
Legacy per-pound cart and reservation counts are converted using 453,592 mg per
pound and the aggregate result is rounded to the nearest 5,000 mg so every live
line remains valid on the new order lattice. Product stock uses the nearest-mg
conversion because stock itself does not need to align to the customer order
step. Package and kit counts remain unchanged.

Historical order rows retain their exact arithmetic meaning. A legacy order
item is backfilled as `PACKAGE`/`EACH` with a basis of one, its previous
quantity becomes `amount`, and its previous unit price remains `priceMinor`.
Therefore its stored line total remains reproducible. New orders snapshot the
structured product rules.

Existing bulk malt and adjunct fixture prices are converted from a pound basis
to the nearest cent per 100 g using exactly 453.59237 g per pound. Existing hop
fixtures already use a 100 g basis. Package and kit prices remain per unit.

## Storefront behavior

- Weight controls show the explicit amount and a `g`/`kg` selector. They enforce
  a 100 g minimum and explain 5 g alignment without silently rounding customer
  input.
- Package controls show integer packs and display net weight only when present.
- Kit controls show integer kits and aggregate yield. Four 18,927 ml kits render
  as approximately 20 US gal / 76 L.
- Catalog cards, product details, the added state, and cart lines use the same
  sale-rule formatter and generated API contract.
- Controls expose stable accessible names, work from the keyboard, and retain
  their meaning at narrow layouts.

The quantity controls are a user-confirmed extension of Figma nodes `9:2284`,
`51:1944`, and `12:1759`. Their styling follows those frames, while their
additional units, validation, and yield labels are documented product behavior
rather than claims about the original Figma content.

## Options rejected

| Option                                         | Reason rejected                                                                                    |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Treat every value as an item count             | A value of two cannot safely mean both 200 g and two pouches, and mixed totals become misleading.  |
| Store decimal grams or kilograms               | It introduces scale and rounding policy into inventory, reservation, JSON, and money calculations. |
| Parse `priceQualifier` strings                 | Display copy is not a stable schema and cannot safely drive pricing or validation.                 |
| Create one SKU for every weight                | It makes direct 155 g orders and large weights impractical and fragments stock unnecessarily.      |
| Guess missing pouch weights                    | It invents product facts and can mislead purchasing and fulfilment.                                |
| Let the browser calculate authoritative totals | It permits stale or manipulated price, basis, and amount combinations at checkout.                 |

## Verification and rollback

O2Q must prove the migration and constraints against PostgreSQL, unit-test
amount validation and integer pricing, exercise cart/reservation/checkout
behavior through the API, and cover the weight, package, kit, badge, keyboard,
and responsive flows in a real browser.

Before merge, rollback is the branch deletion. After deployment, rollback must
use a reviewed compensating migration and application rollback that preserve
order snapshots; resetting the database, forcing `db push`, deleting volumes,
or coercing measured amounts back into generic counts is not permitted.
