'use client';

import { Button } from '../../../components/ui/button';
import { ErrorState } from '../../../components/ui/status';
import styles from '../../../features/product-detail/product-detail.module.css';

export default function ProductDetailError({ reset }: { reset: () => void }) {
  return (
    <section aria-label="Product detail" className={styles.page}>
      <ErrorState
        action={
          <Button onClick={reset} type="button" variant="secondary">
            Try again
          </Button>
        }
        title="Product details unavailable"
      >
        Retry the page. If the problem continues, verify the local API.
      </ErrorState>
    </section>
  );
}
