# ADR 0005: Store administrator product images behind an opaque asset contract

- **Status:** Accepted — M3 execution contract
- **Date:** 2026-08-28
- **Decision owner:** M3 root orchestrator
- **Scope:** administrator image upload, local runtime storage, public delivery,
  database references and future provider migration

## Context and evidence

**Implemented before M3:** fixture images are immutable repository assets under
`/assets/products/<slug>.webp`, and catalog rendering verifies them against the
tracked design-system manifest.

**User decision:** the administrator creation flow now accepts one real product
image. The API, not the browser, owns validation and storage. Runtime storage
must remain local and provider-neutral for this iteration, while a future
storage-provider migration must not change the Product response shape.

**Security boundary:** the multipart body and filename are untrusted. A claimed
MIME type does not prove an image, and a client-controlled path must never reach
the filesystem or `Product.imagePath`.

## Decision

Nest accepts exactly one bounded JPEG, PNG or WebP file on the administrator-
only create endpoint. It decodes and re-encodes the input as metadata-free WebP,
applies an input-pixel limit and a maximum output dimension, generates a UUID-v4
asset key, and writes through a temporary file followed by atomic rename.

The storage root comes from the validated server-only
`PRODUCT_ASSET_STORAGE_PATH`. Local development defaults to an ignored `.local`
directory. Compose mounts a named runtime volume at an explicit API path. No
asset bytes or client filename are written into Git, Notion, OpenAPI or the
Product row.

`Product.imagePath` remains the provider-neutral public reference:

```text
/product-assets/<uuid-v4>.webp
```

The API exposes an exact-key, read-only product-asset endpoint. Next.js proxies
only that same UUID-v4 key shape at `/product-assets/<key>`, while bundled
fixture paths continue to use the strict tracked manifest. Dynamic paths never
weaken the bundled-asset integrity check.

Product persistence happens only after successful image processing and storage.
If database creation fails, the service removes the just-written asset and does
not return success. A successful response therefore never intentionally
publishes a missing image. Crash-orphan reconciliation and remote object-store
lifecycle management belong to the future provider ticket.

## Alternatives considered

1. **Write into tracked `apps/web/public`:** rejected because runtime data would
   mutate source and couple Nest to the frontend checkout.
2. **Store image bytes in PostgreSQL:** rejected because it expands database
   backup and response responsibilities without improving the Product contract.
3. **Persist the client filename/path:** rejected because it enables collisions,
   traversal risk and provider coupling.
4. **Trust MIME/extension without decoding:** rejected because it accepts spoofed
   or malformed content as a public image.
5. **Introduce Firebase now:** rejected; provider provisioning and credentials are
   a separate ticket and unnecessary for the local vertical slice.

## Consequences

**Positive:** upload authority remains server-side; stored objects have one safe
format and opaque identity; public product consumers keep one relative path
contract; local storage can later be replaced behind the same reference.

**Negative:** API and web availability are both required to serve a dynamic
image, and the local named volume needs independent backup/cleanup policy before
production use. Exact crash-orphan garbage collection is not provided by M3.

## Verification and rollback

Tests cover missing/oversized/spoofed/malformed files, image re-encoding,
generated-key path safety, database-failure cleanup, exact public key validation,
private administrator responses, public proxy headers, and catalog/detail
rendering for both bundled and dynamic images.

The database migration preserves the original bundled path constraint and adds
only the UUID-v4 dynamic alternative. Its rollback is atomic and refuses to
strand rows that still reference dynamic assets. Before merge, rollback is branch
removal. After merge, retire or forward-correct affected rows and deploy a
reviewed forward migration; never silently delete product or order history.
