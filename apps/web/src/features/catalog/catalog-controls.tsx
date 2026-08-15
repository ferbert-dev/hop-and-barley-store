import type { PagedCatalogResponse } from '@hop-and-barley/api-client';

import { Button } from '../../components/ui/button';
import { Field, Select } from '../../components/ui/field';
import type { CatalogQuery } from './catalog-query';
import styles from './catalog.module.css';

export function CatalogControls({
  categories,
  query,
  showClear,
}: {
  categories: PagedCatalogResponse['meta']['facets']['categories'];
  query: CatalogQuery;
  showClear: boolean;
}) {
  const limitOptions = [...new Set([query.limit, 12, 24, 48])].sort(
    (left, right) => left - right,
  );

  return (
    <form
      action="/"
      aria-label="Filter products"
      className={styles.filters}
      method="get"
      role="search"
    >
      <div className={styles.filterHeading}>
        <div>
          <p className="eyebrow">Find your ingredients</p>
          <h2>Filter products</h2>
        </div>
        {showClear ? (
          <Button href="/" variant="secondary">
            Clear filters
          </Button>
        ) : null}
      </div>

      <div className={styles.filterFields}>
        <Field
          defaultValue={query.search ?? ''}
          id="catalog-search"
          label="Search products"
          maxLength={80}
          name="search"
          placeholder="Try citrus hops"
          type="search"
        />
        <Select
          defaultValue={query.category ?? ''}
          id="catalog-category"
          label="Category"
          name="category"
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </Select>
        <Field
          defaultValue={query.minPriceMinor ?? ''}
          description="Enter cents: 500 means $5.00."
          id="catalog-min-price"
          inputMode="numeric"
          label="Minimum price"
          name="minPriceMinor"
          pattern="(?:0|[1-9][0-9]*)"
        />
        <Field
          defaultValue={query.maxPriceMinor ?? ''}
          description="Enter cents: 1500 means $15.00."
          id="catalog-max-price"
          inputMode="numeric"
          label="Maximum price"
          name="maxPriceMinor"
          pattern="(?:0|[1-9][0-9]*)"
        />
        <Select
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
        <Select
          defaultValue={String(query.limit)}
          id="catalog-limit"
          label="Products per page"
          name="limit"
        >
          {limitOptions.map((limit) => (
            <option key={limit} value={limit}>
              {limit}
            </option>
          ))}
        </Select>
      </div>

      <Button className={styles.applyButton} type="submit">
        Apply filters
      </Button>
    </form>
  );
}
