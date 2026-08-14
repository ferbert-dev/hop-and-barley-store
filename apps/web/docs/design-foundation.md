# Hop & Barley design foundation

This document defines the production-safe visual inputs shared by future Hop &
Barley routes. It is a foundation only: it does not implement catalog, product,
cart, checkout, authentication, account, or admin behavior.

## Evidence and provenance

- Design layout evidence: the project Figma file, inspected visually only.
- Asset source: the user-supplied local HTML reference at
  `docs/Hop-and-Barley-main/myshop/static/img` in the main checkout.
- Style source: `static/css/main.css` from the same ignored reference bundle.
- The ignored HTML/CSS reference is not copied wholesale and is never read at
  build time or runtime.
- No asset was downloaded from Figma.
- The 13 selected SVGs are processed with pinned SVGO `4.0.1`, multipass, and
  `apps/web/svgo.config.mjs`. This is a one-off development tool invocation,
  not a runtime dependency; it does not change a package manifest or lockfile.
- The supplied reference does not state a separate asset licence. The selected
  production files are therefore project-internal assets and must not be
  redistributed as a standalone asset pack without confirming rights.

The reference uses Inter from Google Fonts and Font Awesome from a CDN. Neither
dependency was copied. The production foundation uses the local system font
stack with Inter as the first optional face, the supplied local SVG controls,
and native or component-owned SVG glyphs. A licensed local Inter font can be
added later with `next/font/local`; runtime font or icon CDN requests are not
allowed.

## Token contract

`src/styles/design-tokens.css` is the CSS source of truth for color, typography,
spacing, radius, shadow, focus, motion, layout, and breakpoint tokens. The
palette maps the verified reference values, including ink `#111d13`, brand
green `#02542d`, muted surface `#f5f5f5`, and border `#d9d9d9`.

The responsive contract is mobile first:

| Name    | Minimum width | Intended behavior                                      |
| ------- | ------------- | ------------------------------------------------------ |
| Compact | `30rem`       | Increase the phone gutter from 16 px to 24 px.         |
| Medium  | `48rem`       | Tablet/two-column threshold and 32 px page gutter.     |
| Wide    | `64rem`       | Desktop navigation/grid threshold and 64 px gutter.    |
| Canvas  | `90rem`       | Maximum design canvas; content remains centered below. |

CSS custom properties document these widths, while media queries repeat the
literal values because CSS custom properties cannot be used in media-query
conditions. `src/design-system/tokens.ts` mirrors the numeric values for React
and image `sizes` props. A unit test prevents the two contracts drifting.

The existing foundation page retains its compatibility variables and behavior.
New product slices should use the `--hb-*` tokens directly.

## Production assets

`src/design-system/assets.ts` is the typed manifest. Every file has a stable
public path, intrinsic dimensions, category, default alt text, semantic role,
and responsive `sizes` value. Use those fields with `next/image`; do not build
paths dynamically from unchecked input.

| Group       | Production files   | Processing                                                   |
| ----------- | ------------------ | ------------------------------------------------------------ |
| Brand       | mark, footer hops  | Deterministic local SVGO output.                             |
| Controls    | account, cart      | Optimized SVG; decorative alt, accessible button label.      |
| Backgrounds | hero, auth pattern | Downscaled and encoded as WebP.                              |
| Products    | 12 product images  | Original dimensions retained, encoded as WebP at quality 84. |
| Reviewers   | 9 unique SVGs      | Optimized locally; source avatars 4 and 8 are identical.     |

SVGO reduced the 13 production SVGs from `1,205,723` to `815,843` bytes, a
`32.3%` reduction. The config preserves root dimensions/view boxes and existing
IDs. XML parsing, source/output geometry comparison, manifest dimension checks,
external/script reference checks, and representative local raster previews
validate the optimized output. Generic formatting is disabled only for
`apps/web/public/assets/**/*.svg` because these files are deterministic
optimizer output, not hand-authored source.

The two oversized reference backgrounds were reduced as follows:

- hop hero: `8704×2176` JPEG → `2560×640` WebP;
- auth pattern: `6000×2000` JPEG → `2400×800` WebP.

The 12 product photos remain at their source dimensions (mostly `1000×667`)
because they are already suitable master sizes for responsive card/detail use.
Next.js can produce smaller delivery variants from the committed WebP masters.
Always pass the manifest `sizes` value so browsers do not assume `100vw` for a
grid item.

The source template references a missing `avatar1.jpg` once. The existing
`avatar1.svg` is the canonical local asset. The source also contains identical
`avatar4.svg` and `avatar8.svg` files; only one production copy is committed and
the reviewer sequence aliases it.

## Responsive image behavior

- Hero and auth backgrounds may span the viewport and use `100vw`.
- Product imagery uses one column below 48 rem, two columns from 48–64 rem, and
  three columns from 64 rem, expressed in `responsiveImageSizes.productGrid`.
- Product media should use a stable aspect-ratio wrapper plus `object-fit: cover`
  where the reference crops cards. Detail media may use `object-fit: contain`
  when the entire package must remain visible.
- The footer illustration caps at 484 px and shrinks to 80 vw on small screens.
- Avatars and header controls have fixed display sizes; their intrinsic
  dimensions remain in the manifest to prevent layout shift.
- Decorative assets keep an empty `alt`; icon buttons must provide their own
  accessible name. Content assets use the manifest alt as a safe default, but
  reviewer components should prefer the actual author name when available.

## Verification and maintenance

`src/design-system/design-foundation.test.ts` verifies that manifest paths are
unique and local, files exist, WebP/SVG dimensions match declarations,
decorative/content alt rules hold, CSS/TypeScript breakpoints agree, and no
runtime font or icon CDN has entered the foundation. It also validates every
production file against `src/design-system/assets.sha256.json` and rejects
script, event-handler, data-URL, or external URL references in optimized SVGs.

When an asset changes, replace only the production file, update its manifest
metadata, and run:

```bash
pnpm dlx svgo@4.0.1 --config apps/web/svgo.config.mjs --folder apps/web/public/assets --recursive
pnpm --filter @hop-and-barley/web test:unit
pnpm --filter @hop-and-barley/web lint
pnpm --filter @hop-and-barley/web typecheck
pnpm --filter @hop-and-barley/web build
```
