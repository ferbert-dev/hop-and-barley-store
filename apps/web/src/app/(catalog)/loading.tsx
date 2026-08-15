import { LoadingState } from '../../components/ui/status';
import { CatalogHero } from '../../features/catalog/catalog-hero';
import styles from '../../features/catalog/catalog.module.css';

export default function CatalogLoading() {
  return (
    <>
      <CatalogHero announce={false} status="not-contacted" />
      <section aria-label="Catalog" className={styles.catalog}>
        <LoadingState title="Loading products">
          Fetching the latest catalog selection.
        </LoadingState>
      </section>
    </>
  );
}
