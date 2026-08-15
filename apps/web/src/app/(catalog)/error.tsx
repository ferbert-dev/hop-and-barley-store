'use client';

import { Button } from '../../components/ui/button';
import { ErrorState } from '../../components/ui/status';
import { CatalogHero } from '../../features/catalog/catalog-hero';
import styles from '../../features/catalog/catalog.module.css';

export default function CatalogError({ reset }: { reset: () => void }) {
  return (
    <>
      <CatalogHero status="unavailable" />
      <section aria-label="Catalog" className={styles.catalog}>
        <ErrorState
          action={
            <Button onClick={reset} type="button" variant="secondary">
              Try again
            </Button>
          }
          title="The catalog could not be displayed"
        >
          Retry the page. If the problem continues, verify the local API.
        </ErrorState>
      </section>
    </>
  );
}
