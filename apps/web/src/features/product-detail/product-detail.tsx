import Image from 'next/image';
import Link from 'next/link';

import { Price } from '../../components/ui/price';
import { productAssetsBySlug } from '../../design-system/assets';
import { isUploadedProductImagePath } from '../../lib/product-image';
import { formatSaleUnit } from '../quantity/quantity-model';
import type { ProductDetailProduct } from '../../lib/product-detail';
import { ProductCartControl } from './product-cart-control';
import styles from './product-detail.module.css';

export function ProductDetail({ product }: { product: ProductDetailProduct }) {
  const asset =
    productAssetsBySlug[product.slug as keyof typeof productAssetsBySlug];
  const isUploadedImage = isUploadedProductImagePath(product.imagePath);
  if ((!asset || asset.src !== product.imagePath) && !isUploadedImage) {
    throw new TypeError(
      `Product detail asset contract failed for ${product.slug}`,
    );
  }

  const paragraphs = product.description
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <article className={styles.page}>
      <p aria-live="polite" className="visually-hidden">
        Viewing {product.name}
      </p>
      <nav aria-label="Breadcrumb" className={styles.breadcrumb}>
        <Link href="/">Products</Link>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{product.name}</span>
      </nav>

      <div className={styles.detailGrid}>
        <div className={styles.media}>
          <Image
            alt={asset?.alt ?? product.name}
            className={styles.image}
            height={asset?.height ?? 667}
            preload
            sizes="(max-width: 47.999rem) calc(100vw - 2rem), (max-width: 63.999rem) 50vw, 40rem"
            src={product.imagePath}
            unoptimized={isUploadedImage}
            width={asset?.width ?? 1000}
          />
        </div>

        <div className={styles.summary}>
          <div>
            <h1 className={styles.title}>{product.name}</h1>
            <p className={styles.teaser}>{product.teaser}</p>
          </div>
          <div className={styles.priceBlock}>
            <Price
              className={styles.price}
              currency="USD"
              minorUnits={product.priceMinor}
            />
            <span className={styles.qualifier}>{formatSaleUnit(product)}</span>
          </div>
          <div aria-label="Product description" className={styles.description}>
            {paragraphs.map((paragraph, index) => (
              <p key={`${String(index)}:${paragraph}`}>{paragraph}</p>
            ))}
          </div>
          <ProductCartControl
            availability={product.availability}
            productName={product.name}
            productSlug={product.slug}
            priceMinor={product.priceMinor}
            quantityMetadata={product}
          />
        </div>
      </div>

      <details className={styles.specs} open>
        <summary>Technical Specifications</summary>
        <dl className={styles.specList}>
          {product.specifications.map(({ label, value }, index) => (
            <div className={styles.specRow} key={`${String(index)}:${label}`}>
              <dt>{label}</dt>
              <dd>
                {Array.isArray(value) ? (
                  <ul>
                    {value.map((item, itemIndex) => (
                      <li key={`${String(itemIndex)}:${item}`}>{item}</li>
                    ))}
                  </ul>
                ) : (
                  value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </details>
    </article>
  );
}
