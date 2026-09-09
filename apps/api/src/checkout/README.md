# O2G private checkout draft boundary

`POST /api/v1/checkout/draft` stores contact, payment selection, and a complete
delivery snapshot. It does not create an order, call a payment provider,
reserve stock, decrement inventory, or clear the cart. `GET` on the same path
returns that private pre-payment snapshot.

Guest access is bound to two independent HttpOnly capabilities: the existing
cart cookie and `hb_guest_checkout` (or `__Host-hb_guest_checkout` on HTTPS).
Only the checkout capability's SHA-256 digest is stored. Its lifetime is an
absolute 24 hours from draft creation and updates do not slide or refresh it.
Once expired, reads fail without returning stored personal data; a new POST may
restart the draft for the still-valid cart and rotates the capability. The raw
capability never belongs in a URL, JSON body, response body, log, or database.

Authenticated drafts use the verified session-owned cart and store `userId`
instead of a guest capability. When login has already adopted the exact guest
cart, its draft may move to that same account owner without email matching.
There is no email-based linking or claiming.

Guest drafts accept only `stripe_debit_card`. This is a selection for later
payment work, not a Stripe integration. Authenticated users retain the existing
Cash on Delivery option. Each draft write requires a database-backed
idempotency key; a retry with the same canonical input returns the stored safe
response, while changed input conflicts.

## Bounded country validation

The canonical country value is ISO 3166-1 alpha-2 `countryCode`; a country name
is not stored. The delivery model is worldwide and therefore does not pretend
that postal codes or administrative areas are universally required:

- Germany (`DE`) requires a five-digit postal code.
- United States (`US`) requires a five- or nine-digit ZIP code and a two-letter
  administrative-area code.
- United Arab Emirates (`AE`) and all other currently unencoded countries keep
  postal code and administrative area optional.
- Names, cities, streets, and optional address details accept international
  Unicode within explicit length limits.

Future country-specific rules extend the DTO and database check together with
fixtures. O2E owns emailed cross-device recovery. O2G intentionally exposes no
public lookup, capability-in-link, account claim, or post-order recovery route.
