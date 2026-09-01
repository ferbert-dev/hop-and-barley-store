import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Button } from '../../components/ui/button';
import { ErrorState } from '../../components/ui/status';
import { CatalogHero } from '../../features/catalog/catalog-hero';
import {
  buildCatalogHref,
  buildCatalogTitle,
  parseCatalogSearchParams,
  type CatalogSearchParams,
} from '../../features/catalog/catalog-query';
import { CatalogScreen } from '../../features/catalog/catalog-screen';
import styles from '../../features/catalog/catalog.module.css';
import { loadCatalog } from '../../lib/catalog';

export interface CatalogPageProps {
  searchParams: Promise<CatalogSearchParams>;
}

export default async function CatalogPage({ searchParams }: CatalogPageProps) {
  const parsed = parseCatalogSearchParams(await searchParams);
  if (parsed.kind === 'invalid') {
    return <InvalidCatalogUrl message={parsed.message} />;
  }
  if (!parsed.isCanonical) redirect(parsed.canonicalHref);

  const result = await loadCatalog(parsed.query);
  if (
    result.connected &&
    result.catalog.kind === 'paged-predecessor' &&
    (parsed.query.category?.length ?? 0) > 1
  ) {
    redirect(
      buildCatalogHref(
        parsed.query,
        { category: parsed.query.category?.slice(0, 1) },
        true,
      ),
    );
  }
  return <CatalogScreen query={parsed.query} result={result} />;
}

export async function generateMetadata({
  searchParams,
}: CatalogPageProps): Promise<Metadata> {
  const parsed = parseCatalogSearchParams(await searchParams);
  return {
    title:
      parsed.kind === 'invalid'
        ? 'Invalid catalog URL | Hop & Barley'
        : buildCatalogTitle(parsed.query),
  };
}

function InvalidCatalogUrl({ message }: { message: string }) {
  return (
    <>
      <CatalogHero status="not-contacted" />
      <section aria-label="Catalog" className={styles.catalog}>
        <ErrorState
          action={
            <Button href="/" variant="secondary">
              Clear catalog URL
            </Button>
          }
          title="Invalid catalog URL"
        >
          {message}
        </ErrorState>
      </section>
    </>
  );
}
