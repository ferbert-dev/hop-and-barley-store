import type {
  LegacyCatalogProduct,
  PagedCatalogProduct,
} from '@hop-and-barley/api-client';
import Image from 'next/image';

import {
  Badge,
  EmptyState,
  ErrorState,
  Price,
  ProductCard,
} from '../components/ui';
import { assets, type AssetDefinition } from '../design-system/assets';
import { loadCatalog } from '../lib/catalog';

export const dynamic = 'force-dynamic';

const productAssetsBySlug: Readonly<Record<string, AssetDefinition>> = {
  'caramel-malt': assets.caramelMalt,
  'cascade-hops': assets.cascadeHops,
  'centennial-hops': assets.centennialHops,
  'citra-hops': assets.citraHops,
  'imperial-yeast': assets.imperialYeast,
  'maris-otter-malt': assets.marisOtterMalt,
  'mosaic-hops': assets.mosaicHops,
  'pilsner-malt': assets.pilsnerMalt,
  'saaz-hops': assets.saazHops,
  'safale-us05-yeast': assets.safaleUs05Yeast,
  'unmalted-wheat': assets.unmaltedWheat,
  'west-coast-ipa-kit': assets.westCoastIpaKit,
};

export default async function Home() {
  const { catalog, connected } = await loadCatalog();

  return (
    <>
      <section className="hero" id="top">
        <div>
          <p className="eyebrow">Local stack · first pour</p>
          <h1>Hop &amp; Barley Store</h1>
          <p className="lede">
            The storefront, API and PostgreSQL database are now sharing one
            dependable development environment.
          </p>
        </div>
        <p
          className={`status ${connected ? 'online' : 'offline'}`}
          role="status"
        >
          <span aria-hidden="true" />
          {connected ? 'API connected' : 'API unavailable'}
        </p>
      </section>

      <section className="catalog" aria-labelledby="catalog-title">
        <div className="section-heading">
          <p className="eyebrow">From the database</p>
          <h2 id="catalog-title">Current selection</h2>
        </div>

        {!connected || catalog === null ? (
          <ErrorState title="Products unavailable">
            Start the local stack and confirm the API is ready before trying
            again.
          </ErrorState>
        ) : catalog.items.length === 0 ? (
          <EmptyState title="No products found">
            The current catalog query returned no active USD products.
          </EmptyState>
        ) : (
          <div className="product-grid">
            {catalog.kind === 'paged'
              ? catalog.items.map((product) => (
                  <PagedProductCard key={product.id} product={product} />
                ))
              : catalog.items.map((product) => (
                  <LegacyProductCard key={product.id} product={product} />
                ))}
          </div>
        )}
      </section>
    </>
  );
}

function PagedProductCard({ product }: { product: PagedCatalogProduct }) {
  return (
    <ProductCard
      badge={
        <Badge
          tone={product.availability === 'in-stock' ? 'success' : 'warning'}
        >
          {product.availability === 'in-stock' ? 'In stock' : 'Out of stock'}
        </Badge>
      }
      description={product.teaser}
      href={`/product/${product.slug}`}
      media={<ProductMedia name={product.name} slug={product.slug} />}
      name={product.name}
      price={
        <>
          <Price currency="USD" minorUnits={product.priceMinor} />{' '}
          <span>{product.priceQualifier}</span>
        </>
      }
    />
  );
}

function LegacyProductCard({ product }: { product: LegacyCatalogProduct }) {
  return (
    <ProductCard
      badge={<Badge tone="neutral">Availability unavailable</Badge>}
      description={product.description}
      href={`/product/${product.slug}`}
      media={<ProductMedia name={product.name} slug={product.slug} />}
      name={product.name}
      price={<Price currency="USD" minorUnits={product.priceMinor} />}
    />
  );
}

function ProductMedia({ name, slug }: { name: string; slug: string }) {
  const asset = productAssetsBySlug[slug];
  if (!asset) {
    return (
      <span
        className="product-media-fallback"
        role="img"
        aria-label={`${name} image unavailable`}
      />
    );
  }

  return (
    <Image
      alt={asset.alt}
      height={asset.height}
      sizes={asset.sizes}
      src={asset.src}
      width={asset.width}
    />
  );
}
