import type {
  LegacyCatalogProduct,
  PagedCatalogProduct,
} from '@hop-and-barley/api-client';
import Image from 'next/image';

import { Badge } from '../../components/ui/badge';
import { ProductCard } from '../../components/ui/card';
import { Price } from '../../components/ui/price';
import { productAssetsBySlug } from '../../design-system/assets';
import styles from './catalog.module.css';

export function PagedCatalogCard({
  product,
}: {
  product: PagedCatalogProduct;
}) {
  const asset =
    productAssetsBySlug[product.slug as keyof typeof productAssetsBySlug];
  if (!asset || asset.src !== product.imagePath) {
    throw new TypeError(`Catalog asset contract failed for ${product.slug}`);
  }

  return (
    <ProductCard
      badge={
        <Badge
          tone={product.availability === 'in-stock' ? 'success' : 'warning'}
        >
          {product.availability === 'in-stock' ? 'In stock' : 'Out of stock'}
        </Badge>
      }
      className={styles.productCard}
      description={product.teaser}
      href={`/product/${product.slug}`}
      media={
        <Image
          alt={asset.alt}
          height={asset.height}
          sizes={asset.sizes}
          src={asset.src}
          width={asset.width}
        />
      }
      name={product.name}
      price={
        <span className={styles.priceLine}>
          <Price currency="USD" minorUnits={product.priceMinor} />
          <span>{product.priceQualifier}</span>
        </span>
      }
    />
  );
}

export function LegacyCatalogCard({
  product,
}: {
  product: LegacyCatalogProduct;
}) {
  const asset =
    productAssetsBySlug[product.slug as keyof typeof productAssetsBySlug];

  return (
    <ProductCard
      badge={<Badge tone="neutral">Availability unavailable</Badge>}
      className={styles.productCard}
      description={product.description}
      href={`/product/${product.slug}`}
      media={
        asset ? (
          <Image
            alt={asset.alt}
            height={asset.height}
            sizes={asset.sizes}
            src={asset.src}
            width={asset.width}
          />
        ) : (
          <span
            aria-label={`${product.name} image unavailable`}
            className={styles.mediaFallback}
            role="img"
          />
        )
      }
      name={product.name}
      price={<Price currency="USD" minorUnits={product.priceMinor} />}
    />
  );
}
