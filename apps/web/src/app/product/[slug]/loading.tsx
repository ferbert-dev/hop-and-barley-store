import { LoadingState } from '../../../components/ui/status';
import styles from '../../../features/product-detail/product-detail.module.css';

export default function ProductDetailLoading() {
  return (
    <section aria-label="Product detail" className={styles.page}>
      <div className="visually-hidden">
        <LoadingState title="Loading product details" />
      </div>
      <div aria-hidden="true" className={styles.skeletonBreadcrumb}>
        <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
      </div>
      <div aria-hidden="true" className={styles.detailGrid}>
        <div className={`${styles.media} ${styles.skeleton}`} />
        <div className={styles.summary}>
          <div>
            <div className={`${styles.skeleton} ${styles.skeletonTitle}`} />
            <div className={`${styles.skeleton} ${styles.skeletonTeaser}`} />
          </div>
          <div className={styles.priceBlock}>
            <div className={`${styles.skeleton} ${styles.skeletonPrice}`} />
            <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
          </div>
          <div className={styles.description}>
            <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
            <div className={`${styles.skeleton} ${styles.skeletonLine}`} />
            <div className={`${styles.skeleton} ${styles.skeletonTeaser}`} />
          </div>
          <div className={styles.cartControl}>
            <div className={`${styles.skeleton} ${styles.skeletonShort}`} />
            <div className={styles.cartActionRow}>
              <div
                className={`${styles.skeleton} ${styles.skeletonQuantity}`}
              />
              <div className={`${styles.skeleton} ${styles.skeletonAction}`} />
            </div>
          </div>
        </div>
      </div>
      <div aria-hidden="true" className={styles.specs}>
        <div className={`${styles.skeleton} ${styles.skeletonTeaser}`} />
      </div>
    </section>
  );
}
