import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Button } from '../../components/ui/button';
import { ErrorState } from '../../components/ui/status';
import { CatalogHero } from '../../features/catalog/catalog-hero';
import {
  parseCatalogSearchParams,
  type CatalogQuery,
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

function buildCatalogTitle(query: CatalogQuery): string {
  if (query.search) return `${query.search} — Hop & Barley products`;
  if (query.category?.length) {
    const category = query.category.map(titleCaseSlug).join(' and ');
    return `${category} — Hop & Barley products`;
  }
  if (query.page > 1) {
    return `Shop brewing ingredients — Page ${query.page} | Hop & Barley`;
  }
  return 'Shop brewing ingredients | Hop & Barley';
}

function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(' ');
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
