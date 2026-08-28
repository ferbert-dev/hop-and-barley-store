import type { PagedCatalogResponse } from '@hop-and-barley/api-client';

import { Button } from '../../components/ui/button';
import { Field, Select } from '../../components/ui/field';
import { buildCatalogHref, type CatalogQuery } from './catalog-query';
import styles from './catalog.module.css';

type CatalogHrefBuilder = (
  current: CatalogQuery,
  overrides?: Partial<CatalogQuery>,
  resetPage?: boolean,
) => string;

export function CatalogControls({
  action = '/',
  buildHref = buildCatalogHref,
  categories,
  query,
  showClear,
}: {
  action?: string;
  buildHref?: CatalogHrefBuilder;
  categories: PagedCatalogResponse['meta']['facets']['categories'];
  query: CatalogQuery;
  showClear: boolean;
}) {
  const searchTokens = query.search?.split(' ') ?? [];
  const productTypes = categories
    .filter((category) => PRODUCT_TYPE_LABELS.has(category.slug))
    .sort(
      (left, right) =>
        PRODUCT_TYPE_ORDER.indexOf(left.slug) -
        PRODUCT_TYPE_ORDER.indexOf(right.slug),
    );

  return (
    <form
      action={action}
      aria-label="Filter products"
      className={styles.filters}
      method="get"
      role="search"
    >
      <div className={styles.filterHeading}>
        {showClear ? (
          <Button href={action} variant="secondary">
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className={styles.searchRow}>
        <Field
          className={styles.searchInput}
          defaultValue={query.search ?? ''}
          id="catalog-search"
          label="Search products"
          maxLength={80}
          name="search"
          placeholder="Try citrus hops"
          type="search"
        />
        <Button className={styles.searchButton} type="submit">
          Search
        </Button>
      </div>

      {searchTokens.length > 0 ? (
        <ul aria-label="Search keywords" className={styles.keywordChips}>
          {searchTokens.map((token, index) => (
            <li key={`${String(index)}:${token}`}>
              <a
                aria-label={`Remove keyword ${token}`}
                href={buildHref(
                  query,
                  {
                    search: removeSearchToken(searchTokens, index),
                  },
                  true,
                )}
              >
                {token}
                <span aria-hidden="true">×</span>
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <fieldset
        aria-label="Product Type"
        className={styles.productTypes}
        role="radiogroup"
      >
        <legend>Product Type</legend>
        <div className={styles.productTypeList}>
          {productTypes.map((category) => (
            <label className={styles.productType} key={category.slug}>
              <input
                defaultChecked={query.category === category.slug}
                name="category"
                type="radio"
                value={category.slug}
              />
              <span>{PRODUCT_TYPE_LABELS.get(category.slug)}</span>
            </label>
          ))}
        </div>
        {query.category ? (
          <a
            className={styles.clearProductType}
            href={buildHref(query, { category: undefined }, true)}
          >
            Clear product type
          </a>
        ) : null}
      </fieldset>

      <div className={styles.sortField}>
        <Select
          className={styles.sortSelect}
          defaultValue={query.sort}
          id="catalog-sort"
          label="Sort by"
          name="sort"
        >
          <option value="name-asc">Name: A to Z</option>
          <option value="name-desc">Name: Z to A</option>
          <option value="price-asc">Price: low to high</option>
          <option value="price-desc">Price: high to low</option>
        </Select>
      </div>

      {query.minPriceMinor !== undefined ? (
        <input name="minPriceMinor" type="hidden" value={query.minPriceMinor} />
      ) : null}
      {query.maxPriceMinor !== undefined ? (
        <input name="maxPriceMinor" type="hidden" value={query.maxPriceMinor} />
      ) : null}
      {query.limit !== 12 ? (
        <input name="limit" type="hidden" value={query.limit} />
      ) : null}
    </form>
  );
}

const PRODUCT_TYPE_ORDER = ['hops', 'malts', 'yeast', 'adjuncts'];
const PRODUCT_TYPE_LABELS = new Map([
  ['hops', 'Hops'],
  ['malts', 'Malt'],
  ['yeast', 'Yeast'],
  ['adjuncts', 'Adjuncts'],
]);

function removeSearchToken(
  tokens: string[],
  index: number,
): string | undefined {
  const next = tokens
    .filter((_token, tokenIndex) => tokenIndex !== index)
    .join(' ');
  return next || undefined;
}
