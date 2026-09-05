import type {
  LegacyCatalogProduct,
  PagedCatalogProduct,
} from '@hop-and-barley/api-client';
import Image from 'next/image';

import { ProductCard } from '../../components/ui/card';
import { Price } from '../../components/ui/price';
import { productAssetsBySlug } from '../../design-system/assets';
import { isUploadedProductImagePath } from '../../lib/product-image';
import { formatSaleUnit } from '../quantity/quantity-model';
import styles from './catalog.module.css';

export function PagedCatalogCard({
  product,
}: {
  product: PagedCatalogProduct;
}) {
  const asset =
    productAssetsBySlug[product.slug as keyof typeof productAssetsBySlug];
  const isUploadedImage = isUploadedProductImagePath(product.imagePath);
  if ((!asset || asset.src !== product.imagePath) && !isUploadedImage) {
    throw new TypeError(`Catalog asset contract failed for ${product.slug}`);
  }

  return (
    <ProductCard
      className={styles.productCard}
      description={product.teaser}
      href={`/product/${product.slug}`}
      media={
        <Image
          alt={asset?.alt ?? product.name}
          height={asset?.height ?? 667}
          sizes={asset?.sizes ?? '(max-width: 47.999rem) 100vw, 33vw'}
          src={product.imagePath}
          unoptimized={isUploadedImage}
          width={asset?.width ?? 1000}
        />
      }
      name={product.name}
      price={
        <span className={styles.priceLine}>
          <Price currency={product.currency} minorUnits={product.priceMinor} />
          <span>{formatSaleUnit(product)}</span>
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
      price={
        <Price currency={product.currency} minorUnits={product.priceMinor} />
      }
    />
  );
}
