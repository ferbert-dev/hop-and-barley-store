# Figma navigation source — Hop & Barley Shop

**Source Figma:** https://figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=0-1

**Inspected:** 2026-08-23, through the available authenticated browser session, using the Figma **Pages** and **Layers** panels and the visible canvas.

This document is the navigation index for the supplied design. It records only what is visible in that file plus requirements explicitly agreed by the user. It is not evidence that any behavior is implemented.

## Evidence labels

- **Confirmed by the design** — visible layer, text, control, state, or neighboring frame.
- **Agreed by the user, absent from the design** — required behavior supplied explicitly by the user but not represented in Figma.
- **Unclear — ask the user** — missing state, rule, destination, or interaction that must not be invented.

Control labels can suggest a destination, but they do not prove prototype wiring. No prototype interaction map was available in the inspected view; all transitions below are therefore described as **label-implied** unless stated otherwise.

## Layers tree

The file exposes one page, `Page 1` (`0:1`). The tree below preserves the complete accessible top-level order and the meaningful direct children visible in Layers. Repeated internal vector/text primitives are not promoted to product concepts.

```text
Page 1 (0:1)
├── Frame 4 (2034:1532)
│   ├── Don't ask to edit
│   └── pixso
├── Plus (2015:1415)
│   ├── 48 → Icon
│   ├── 16 → Icon
│   ├── 20 → Icon
│   ├── 24 → Icon
│   ├── 32 → Icon
│   └── 40 → Icon
├── Minus (2015:1401)
│   ├── 48
│   ├── 16
│   ├── 20
│   ├── 24
│   ├── 32
│   └── 40
├── faHandPointUp (2003:1751)
│   └── Vector
├── Accordion (2003:1622)
│   ├── Accordion Item
│   └── Accordion Item
├── hopfen-fields 1 (2002:1721)
├── 1399392 (47:1535)
│   ├── Group
│   └── Vector
├── Checkbox Field (68:1875)
│   ├── Checkbox and Label
│   └── Description Row
├── Header (11:413)
│   ├── log-in
│   └── Default
├── account/forgot_password (22:721)
│   ├── Header
│   ├── Group 3
│   └── Footer
├── account/login (21:629)
│   ├── Header
│   ├── Group 2
│   └── Footer
├── account/register (18:811)
│   ├── Header
│   ├── Group 1
│   └── Footer
├── admin/add (33:1520)
│   ├── Header
│   └── Card Grid Content List
├── admin/Dashboard (37:1539)
│   ├── Header
│   └── Card Grid Content List
├── admin/products (33:734)
│   ├── Header
│   └── Card Grid Content List
├── account/orders (26:2208)
│   ├── Header
│   ├── Card Grid Content List
│   └── Footer
├── account/edit (26:1977)
│   ├── Header
│   ├── Card Grid Content List
│   └── Footer
├── checkout (15:367)
│   ├── Header
│   ├── Card Grid Content List
│   └── Footer
├── Button (12:1512)
│   ├── Remove
│   └── X
├── cart (12:1759)
│   ├── Header
│   ├── Card Grid Content List
│   └── Footer
├── added (51:1944)
├── product (9:2284)
│   ├── Header
│   ├── Page Product
│   ├── Accordion
│   ├── Card Grid Reviews
│   └── Footer
└── ProductList (5:2896)
    ├── Header
    ├── Frame 4
    ├── Page Product Results
    └── Footer
```

## Shared shell and components

### Header

**Confirmed by the design**

- Brand: hop icon plus `Hop & Barley`.
- Public navigation: `Products`, `Guides & Recipes`, `Community`, `Resources`, `Contact`.
- Signed-out variant: `Sign in` and `Register`.
- Signed-in/default variant: account icon and cart icon.

**Unclear — ask the user**

- Active, hover, mobile, overflow, and signed-in menu states are absent.
- No screens exist for `Guides & Recipes`, `Community`, `Resources`, or `Contact`; confirm whether they are in product scope and where they lead.

### Footer

**Confirmed by the design**

- Dark section with hop illustration.
- Links: `Contact`, `FAQ`, `Community`, `Resources`, `License`.
- Copyright text: `© Hop & Barley 2025. All rights reserved`.

**Unclear — ask the user**

- Link destinations and whether the year is fixed or dynamic.

### Reusable controls and assets

**Confirmed by the design**

- `Plus` and `Minus` size variants: 16, 20, 24, 32, 40, and 48.
- `Accordion` contains two `Accordion Item` layers.
- `Checkbox Field` contains `Checkbox and Label` plus `Description Row`.
- `Button` groups `Remove` and `X`.
- Standalone `faHandPointUp`, `hopfen-fields 1`, and `1399392` assets/layers.

**Unclear — ask the user**

- Disabled, focus, hover, pressed, validation, and accessibility states are not specified for these controls.
- The product role of the service-like `Frame 4` (`Don't ask to edit`, `pixso`) is not clear; do not treat it as a storefront screen.

## Functional screens and states

### Product list — `ProductList`

[Open node `5:2896`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=5-2896)

**Confirmed by the design**

- **Fields/controls:** search field; removable keyword chips; product-type checkboxes for `Hops`, `Malt`, `Yeast`, and `Adjuncts`; sorting by `New`, `Price ascending`, `Price descending`, and `Rating`.
- **Text/content:** hop hero image; three-column product cards with image, name, price, and one-line description; pagination `Previous`, `1`, `2`, `3`, `…`, `20`, `Next`.
- **Visible state:** `New` is selected; page `1` is active; multiple keyword chips and product-type selections are visible.
- **Label-implied transitions:** product card → `product`; pagination → another result page; search/filter/sort → updated result set.

**Unclear — ask the user**

- Search matching rules, filter combination logic, URL/query persistence, default sort, result counts, and zero/loading/error states.
- Responsive layouts and the card destination are not prototype-confirmed.

### Product details — `product`

[Open node `9:2284`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=9-2284)

**Confirmed by the design**

- **Fields/controls:** `Add to Cart`; `Technical Specifications` accordion.
- **Text/content:** sample product `Citra Hops`, `per 100g`, `$5.99`, marketing description, specifications, and `Latest reviews`.
- **Visible state:** three review cards with star outlines, title `Explosive Citrus Aroma!`, body copy, avatar, and username; specifications are shown expanded in the frame.
- **Label-implied transitions:** `Add to Cart` → quantity state represented by `added`; accordion toggles specifications.

**Unclear — ask the user**

- Initial accordion state, review submission flow, authentication requirement, unavailable/out-of-stock state, and what opens after selecting the cart icon.

**User-confirmed quantity extension — 2026-08-27, revised by O2S**

- Bulk ingredients are sold by weight. The storefront uses one kilogram input,
  prices against an explicit 100 g basis, starts at 0.1 kg, and accepts direct
  values aligned to 0.1 kg. The selected summary uses grams below 1 kg and
  kilograms from 1 kg upward.
- Packaged products remain an integer pack count. Show package net weight only
  when catalog data supplies it; do not infer a pouch weight.
- Recipe kits remain an integer kit count and show the aggregate batch yield for
  the selected count in gallons and approximate litres.
- Product details always keep the `Add to Cart` action. When the product already
  has a cart line, another add increments that line by the newly selected amount
  instead of replacing it. The product page does not show a separate `in cart`
  quantity; line editing remains on the shopping-cart screen.
- These controls extend the approved Figma visual language. They are a product
  decision, not evidence that the additional labels or states were drawn in the
  source frame.

### Added-to-cart quantity state — `added`

[Open node `51:1944`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=51-1944)

**Confirmed by the design**

- Horizontal quantity control: minus, `1 in cart`, plus.
- **Label-implied transitions:** plus/minus changes quantity; this is a component state, not a full-page confirmation screen.

**Unclear — ask the user**

- Zero behavior, disabled state, stock-conflict update latency, and error feedback.

**User-confirmed quantity extension — 2026-08-27**

- The displayed value is the physical amount, not a generic item count: for
  example `200 g`, `10 kg`, `2 packs`, or `4 kits`.
- Weight plus/minus and direct entry use the same 100 g lattice. Each distinct
  weight line may reach 100 kg, or a lower explicit product maximum,
  independently of current stock and every other cart line. There is no
  aggregate cart-weight ceiling.
- The 2026-08-27 product decision supersedes this product-detail component
  state: the detail page retains `Add to Cart` and does not render `1 in cart`.
  Quantity editing is still available on the shopping-cart screen.

### Shopping cart — `cart`

[Open node `12:1759`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=12-1759)

**Confirmed by the design**

- **Fields/controls:** per-line minus/count/plus control; `Remove` with `X`; `Proceed to Checkout`.
- **Text/content:** heading `Shopping Cart`; sample lines `Citra Hops` (`$29.95`, `per 100g`, quantity 5) and `Caramel Malt 60L` (`$3.00`, `per 100g`, quantity 1); `Total $32.95`.
- **Visible state:** non-empty cart with two product lines.
- **Label-implied transitions:** quantity controls update totals; `Remove` removes a line; `Proceed to Checkout` → `checkout`.

**Unclear — ask the user**

- Empty cart, removal undo/confirmation, stock conflicts, recalculation/loading/error behavior, taxes, shipping, discounts, and currency rules.

**User-confirmed quantity extension — 2026-08-27**

- Each line shows its sale kind, exact selected physical amount, price basis, and
  server-calculated line total.
- Weight input uses kilograms while the selected physical amount is formatted
  in grams below 1 kg and kilograms from 1 kg upward. Package and kit lines use
  integer counts. A kit line also shows aggregate yield, for example four
  5-gallon kits as 20 gal and approximately 76 L.
- The header badge counts distinct product lines. It never sums grams, packs,
  and kits into one dimensionless number.

**User-confirmed immediate cart and checkout extension — 2026-08-27, revised by O2S**

- Per-line plus/minus controls persist the new canonical amount immediately;
  valid direct entry persists on Enter or blur. There is no separate `Update`
  action.
- The line total and cart total update optimistically with integer basis
  pricing, then reconcile to the server response. The server remains
  authoritative for amount and money. Cart intent neither reserves nor
  decrements stock.
- The cart does not show redundant `Selected`, `Selection price`, or visible
  `Line total updating` rows. The localized reference price and basis sit below
  the product name; the line total remains at the upper right.
- Product image and name link to the product detail route. `Remove` is a grey
  secondary action at the lower right. Checkout and clear-cart layout remain
  stable while a line update is pending.
- Activating `Proceed to Checkout` sends one private, non-mutating availability
  check. While it is pending, its stable accessible label is `Checking
availability…`. A ready result navigates to `checkout`. An unavailable
  result stays on the cart, preserves every line and its quantity controls,
  shows `Availability needs attention`, and gives each failed line an
  accessible explanation. The four confirmed explanations are `This item is no
longer available.`, `This amount is not currently available.`, `Choose a
valid amount for this item.`, and `This item cannot be checked out right
now.`
- A transport failure is generic and recoverable: `We couldn’t check
availability. Try again.` The restored primary checkout control initiates a
  fresh check. There is no reservation countdown, renewal, stock recheck
  control, or cart-time allocation.
- These behaviors refine the label-implied Figma quantity interaction and are
  a product decision, not evidence that the extra states were drawn in the
  source frame.

### Checkout — `checkout`

[Open node `15:367`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=15-367)

**Confirmed by the design**

- **Fields:** `Full Name`, `Phone number`, `City`, multiline `Shipping address`.
- **Payment choices:** `Debit Card` selected, `Digital Wallet`, `Cash On Delivery`.
- **Text/content:** `Shipping information`, `Payment Method`, `Order Summary`, `Total $32.95`, `Pay`.
- **Visible state:** one selected payment method and populated example personal data.
- **Label-implied transition:** `Pay` → order submission; no destination screen is present.

**Unclear — ask the user**

- Required/optional fields, validation, address structure, card/wallet detail collection, payment provider, taxes/shipping, processing, success, failure, retry, cancellation, and order-confirmation screens.

**Agreed by the user, absent from the design — O2S**

- Cash On Delivery is the only order-placement method in this slice. Final
  order placement—not the cart availability check—atomically revalidates and
  allocates stock before payment success. Stripe/provider orchestration is
  future scope.

### Registration — `account/register`

[Open node `18:811`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=18-811)

**Confirmed by the design**

- **Fields/controls:** `Email`, `Password`, checked `Remember me`, `Register`, divider `Or`, `Continue with Google`.
- **Visible state:** empty/value-placeholder form on the hop-pattern background.
- **Label-implied transitions:** `Register` → account creation; `Continue with Google` → Google authentication; header `Sign in` → `account/login`.

**Agreed by the user, absent from the design**

- Password must be at least 12 characters total; the required character categories count within that same total, not in addition to it.
- Password must include at least one lowercase letter, one uppercase letter, one digit, and one special character.
- Add a confirmation-password field.
- Show a live requirement list that updates as the user types.
- Remove `Remember me` from registration; it belongs to login only.
- Keep `Continue with Google` visible but clearly inert during the email/password MVP; Google authentication is deferred.

These additions define required behavior only. The implementation may use the smallest accessible treatment needed for the confirmed behavior, but must not present that treatment as Figma-authored.

**Unclear — ask the user**

- Registration success destination, duplicate-email response, inline/server errors, loading/disabled state, terms/privacy consent, email verification, and any future Google cancellation/failure states.

### Sign in — `account/login`

[Open node `21:629`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=21-629)

**Confirmed by the design**

- **Fields/controls:** `Email`, `Password`, `Sign In`, `Forgot password?`, divider `Or`, `Continue with Google`, `Don't have an account? Register`.
- **Visible state:** empty/value-placeholder sign-in form.
- **Label-implied transitions:** `Forgot password?` → `account/forgot_password`; `Register` → `account/register`; Google button → Google authentication; `Sign In` → signed-in storefront.

**Unclear — ask the user**

- Signed-in destination, invalid-credential copy, password visibility, remember-session behavior, loading/disabled state, lockout/rate-limit presentation, and Google cancellation/failure.

### Forgot password — `account/forgot_password`

[Open node `22:721`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=22-721)

**Confirmed by the design**

- **Field/control:** `Email`, `Cancel`, `Reset Password`.
- **Visible state:** compact email form; no page/form title is visible.
- **Label-implied transitions:** `Reset Password` → reset request; `Cancel` → unspecified prior/auth screen.

**Unclear — ask the user**

- Cancel destination, neutral anti-enumeration copy, validation/loading state, request-success state, email content, token-entry/new-password screens, expired/used token, and resend behavior.

### Account information — `account/edit`

[Open node `26:1977`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=26-1977)

**Confirmed by the design**

- **Tabs:** `Order History`, `Account Information` with account information active.
- **Fields/controls:** `Full Name`, `Phone number`, `Email`, `City`, multiline `Shipping address`, `Save`, `Logout`.
- **Visible state:** populated examples for phone and email.
- **Label-implied transitions:** `Order History` → `account/orders`; `Save` → persist profile; `Logout` → signed-out storefront/auth entry.

**Unclear — ask the user**

- Whether email is editable, validation/normalization, save success/error feedback, unsaved-change handling, logout confirmation, and reauthentication for sensitive changes.

### Order history — `account/orders`

[Open node `26:2208`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=26-2208)

**Confirmed by the design**

- **Tabs:** `Order History` active and `Account Information`.
- **Table:** `Order Details`, `Order Status`, `Total`; sample order number/date, total, and statuses `Pending`, `Confirmed`, `Delivered`, `Shipped`.
- **Controls/state:** `Previous` disabled-looking, `Next` available-looking; populated history list.
- **Label-implied transitions:** `Account Information` → `account/edit`; pagination changes the history page.

**Unclear — ask the user**

- Whether a row opens order details, the complete status vocabulary/order, tracking/cancellation/returns, empty/loading/error states, page size, and date/currency formatting.

### Admin product list — `admin/products`

[Open node `33:734`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=33-734)

**Confirmed by the design**

- **Tabs:** `Product Management` active and `Dashboard`.
- **Controls:** `+ Add Product`; `Edit` on every row; pagination `Previous`, `1`, `2`, `3`, `…`, `20`, `Next`.
- **Table:** `id`, `name`, `description`, `price`, `category`, `created_at`, `updated_at`; populated sample rows.
- **Label-implied transitions:** `+ Add Product` → `admin/add`; `Dashboard` → `admin/Dashboard`; `Edit` → an edit form not separately named in Layers.

**Unclear — ask the user**

- Edit-route ownership, sorting/filter/search, empty/loading/error states, permissions, timestamps/timezone, pagination rules, and whether hidden/deleted products remain listed.

### Admin add/edit product — `admin/add`

[Open node `33:1520`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=33-1520)

**Confirmed by the design**

- **Controls:** image placeholder and `Upload Image`; `Save`, `Hide`, `Delete`.
- **Fields:** `Title`, multiline `description`, `price`, `category` with generic `Label` choices.
- **Text:** `Admin - Product Stock`, `Control`, card heading `Shipping information` (despite product fields).
- **Label-implied transitions:** `Save` persists; `Hide` changes visibility; `Delete` deletes; tabs lead to product management/dashboard.

**Unclear — ask the user**

- Whether this frame serves both add and edit, why it says `Shipping information`, category values, image constraints/crop/preview, price units/currency, validation, save success/error, hide semantics, and delete confirmation/rollback.

### Admin dashboard — `admin/Dashboard`

[Open node `37:1539`](https://www.figma.com/design/H7jIUNYzAGc7o8R0iABQjy/Project-M4-1--Next.js--share-?node-id=37-1539)

**Confirmed by the design**

- **Tabs:** `Product Management` and `Dashboard`.
- **Controls/state:** four generic `Label` chips, first selected.
- **Metric cards:** `Total Sales $89,000` with `4.3% Down from yesterday`; `Total User 40,689` with `8.5% Up from yesterday`; `Total Order 10293` with `1.3% Up from past week`; `Total Pending 2040` with `1.8% Up from yesterday`.
- **Label-implied transition:** `Product Management` → `admin/products`; no metric-card destination is shown.

**Unclear — ask the user**

- Meaning of the four `Label` filters, metric definitions, date range/timezone, currency, drill-down behavior, access roles, and loading/empty/error states.

## Decisions needed before design or implementation

1. Define authentication result/error states, email verification, and the complete password-reset journey.
2. Define checkout payment collection plus processing, success, failure, and order-confirmation screens.
3. Define responsive/mobile layouts and cross-screen loading, empty, validation, disabled, and error states.
4. Confirm destinations for header/footer content links and whether those sections are in scope.
5. Confirm admin permissions, edit/add route behavior, category values, `Hide`, and destructive `Delete` handling.
6. Product/cart quantity and availability behavior is decided by ADR 0002;
   supplier/backorder sourcing and delivery promises remain future scope.
   Confirm order-details behavior and review submission behavior.
