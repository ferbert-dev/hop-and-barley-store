import { CatalogHero } from '../../features/catalog/catalog-hero';
import { CatalogInitialSkeleton } from '../../features/catalog/catalog-skeleton';

export default function CatalogLoading() {
  return (
    <>
      <CatalogHero announce={false} status="not-contacted" />
      <CatalogInitialSkeleton />
    </>
  );
}
