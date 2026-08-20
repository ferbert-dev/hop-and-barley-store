import { LoadingState } from '../../../components/ui/status';
import styles from '../../../features/product-detail/product-detail.module.css';

export default function ProductDetailLoading() {
  return (
    <section aria-label="Product detail" className={styles.page}>
      <LoadingState title="Loading product details">
        Fetching the latest product information.
      </LoadingState>
    </section>
  );
}
