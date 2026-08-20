import { Button } from '../../../components/ui/button';
import { EmptyState } from '../../../components/ui/status';
import styles from '../../../features/product-detail/product-detail.module.css';

export default function ProductDetailNotFound() {
  return (
    <section aria-label="Product detail" className={styles.page}>
      <EmptyState
        action={
          <Button href="/" variant="secondary">
            Back to products
          </Button>
        }
        title="Product not found"
      >
        This product is unavailable or no longer part of the public catalog.
      </EmptyState>
    </section>
  );
}
