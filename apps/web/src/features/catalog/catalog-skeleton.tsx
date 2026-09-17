import styles from './catalog.module.css';

export function CatalogProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-hidden="true" className={styles.productGrid}>
      {Array.from({ length: count }, (_, index) => (
        <div
          className={styles.productSkeleton}
          data-testid="catalog-product-skeleton"
          key={index}
        >
          <span
            className={`${styles.skeletonSurface} ${styles.skeletonMedia}`}
          />
          <span
            className={`${styles.skeletonSurface} ${styles.skeletonEyebrow}`}
          />
          <span
            className={`${styles.skeletonSurface} ${styles.skeletonTitle}`}
          />
          <span
            className={`${styles.skeletonSurface} ${styles.skeletonPrice}`}
          />
          <span
            className={`${styles.skeletonSurface} ${styles.skeletonDescription}`}
          />
        </div>
      ))}
    </div>
  );
}

export function CatalogInitialSkeleton() {
  return (
    <section aria-busy="true" aria-label="Catalog" className={styles.catalog}>
      <p className="visually-hidden" role="status">
        Loading products
      </p>
      <div aria-hidden="true" className={styles.catalogInitialLoading}>
        <span
          className={`${styles.skeletonSurface} ${styles.skeletonHeading}`}
        />
        <div className={styles.skeletonControls}>
          <span
            className={`${styles.skeletonSurface} ${styles.skeletonSearch}`}
          />
          <span
            className={`${styles.skeletonSurface} ${styles.skeletonFilter}`}
          />
          <span
            className={`${styles.skeletonSurface} ${styles.skeletonSort}`}
          />
        </div>
        <CatalogProductGridSkeleton />
      </div>
    </section>
  );
}
