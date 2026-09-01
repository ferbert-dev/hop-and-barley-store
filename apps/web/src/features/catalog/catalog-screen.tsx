import type { CatalogLoadResult } from '../../lib/catalog';
import { Button } from '../../components/ui/button';
import { EmptyState, ErrorState } from '../../components/ui/status';
import { CatalogControls } from './catalog-controls';
import { CatalogHero } from './catalog-hero';
import { CatalogPagination } from './catalog-pagination';
import { LegacyCatalogCard, PagedCatalogCard } from './catalog-product';
import { buildCatalogHref, type CatalogQuery } from './catalog-query';
import {
  CatalogSearchResults,
  CatalogSearchTransitionProvider,
} from './catalog-search-transition';
import styles from './catalog.module.css';

export function CatalogScreen({
  query,
  result,
}: {
  query: CatalogQuery;
  result: CatalogLoadResult;
}) {
  if (!result.connected || result.catalog === null) {
    return (
      <>
        <CatalogHero status="unavailable" />
        <section aria-label="Catalog" className={styles.catalog}>
          <ErrorState
            action={
              <Button href={buildCatalogHref(query)} variant="secondary">
                Try again
              </Button>
            }
            title="Products unavailable"
          >
            The store could not reach the catalog safely. Check the local API
            and try again.
          </ErrorState>
        </section>
      </>
    );
  }

  if (result.catalog.kind === 'legacy') {
    return (
      <>
        <CatalogHero status="connected" />
        <section className={styles.catalog} aria-labelledby="catalog-title">
          <CatalogHeading />
          <p className={styles.notice}>
            Filtering and paging are temporarily unavailable while the catalog
            API is using its rollback response.
          </p>
          <div className={styles.productGrid}>
            {result.catalog.items.map((product) => (
              <LegacyCatalogCard key={product.id} product={product} />
            ))}
          </div>
        </section>
      </>
    );
  }

  const { items, meta } = result.catalog;
  const hasFilters = Boolean(
    query.search ||
    query.category?.length ||
    query.minPriceMinor !== undefined ||
    query.maxPriceMinor !== undefined,
  );

  return (
    <>
      <CatalogHero status="connected" />
      <section className={styles.catalog} aria-labelledby="catalog-title">
        <CatalogHeading />
        <div className={styles.discoveryLayout}>
          <CatalogSearchTransitionProvider activeSearch={query.search ?? ''}>
            <CatalogControls
              categories={meta.facets.categories}
              categorySelection={
                result.catalog.kind === 'paged-predecessor'
                  ? 'single'
                  : 'multiple'
              }
              query={query}
            />
            <CatalogSearchResults>
              <div className={styles.resultHeading}>
                <p aria-live="polite">
                  {meta.totalItems}{' '}
                  {meta.totalItems === 1 ? 'product' : 'products'} found
                </p>
              </div>
              {items.length > 0 ? (
                <>
                  <div className={styles.productGrid}>
                    {items.map((product) => (
                      <PagedCatalogCard key={product.id} product={product} />
                    ))}
                  </div>
                  <CatalogPagination
                    query={query}
                    totalPages={meta.totalPages}
                  />
                </>
              ) : (
                <CatalogEmptyState
                  hasFilters={hasFilters}
                  query={query}
                  totalItems={meta.totalItems}
                  totalPages={meta.totalPages}
                />
              )}
            </CatalogSearchResults>
          </CatalogSearchTransitionProvider>
        </div>
      </section>
    </>
  );
}

function CatalogHeading() {
  return (
    <div className={styles.sectionHeading}>
      <h2 id="catalog-title">Find your ingredients</h2>
    </div>
  );
}

function CatalogEmptyState({
  hasFilters,
  query,
  totalItems,
  totalPages,
}: {
  hasFilters: boolean;
  query: CatalogQuery;
  totalItems: number;
  totalPages: number;
}) {
  if (totalItems > 0 && query.page > totalPages) {
    return (
      <EmptyState
        action={
          <Button href={buildCatalogHref(query, { page: 1 })}>
            Go to first page
          </Button>
        }
        title="This catalog page is empty"
      >
        The products are on an earlier page.
      </EmptyState>
    );
  }
  if (hasFilters) {
    return (
      <EmptyState
        action={<Button href="/">Clear filters</Button>}
        title="No products match these filters"
      >
        Try a broader search or remove one of the filters.
      </EmptyState>
    );
  }
  return (
    <EmptyState title="The catalog is still being stocked">
      No active products are available yet.
    </EmptyState>
  );
}
