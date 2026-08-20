import Image from 'next/image';
import Link from 'next/link';

import { Badge } from '../../components/ui/badge';
import { Price } from '../../components/ui/price';
import { productAssetsBySlug } from '../../design-system/assets';
import type { ProductDetailProduct } from '../../lib/product-detail';
import styles from './product-detail.module.css';

export function ProductDetail({ product }: { product: ProductDetailProduct }) {
  const asset =
    productAssetsBySlug[product.slug as keyof typeof productAssetsBySlug];
  if (!asset || asset.src !== product.imagePath) {
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
            alt={asset.alt}
            className={styles.image}
            height={asset.height}
            preload
            sizes="(max-width: 47.999rem) calc(100vw - 2rem), (max-width: 63.999rem) 50vw, 40rem"
            src={asset.src}
            width={asset.width}
          />
        </div>

        <div className={styles.summary}>
          <div className={styles.badges}>
            <Badge tone="neutral">{product.category.name}</Badge>
            <Badge
              tone={product.availability === 'in-stock' ? 'success' : 'warning'}
            >
              {product.availability === 'in-stock'
                ? 'In stock'
                : 'Out of stock'}
            </Badge>
          </div>
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
            <span className={styles.qualifier}>{product.priceQualifier}</span>
          </div>
          <div aria-label="Product description" className={styles.description}>
            {paragraphs.map((paragraph, index) => (
              <p key={`${String(index)}:${paragraph}`}>{paragraph}</p>
            ))}
          </div>
        </div>
      </div>

      <section
        aria-labelledby="product-specifications"
        className={styles.specs}
      >
        <h2 id="product-specifications">Technical specifications</h2>
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
      </section>
    </article>
  );
}
