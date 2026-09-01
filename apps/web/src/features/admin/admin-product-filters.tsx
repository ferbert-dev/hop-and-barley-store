import type { components } from '@hop-and-barley/api-client';

import { Button } from '../../components/ui/button';
import { Field, Select } from '../../components/ui/field';
import styles from './admin-products.module.css';
import {
  buildAdminProductsHref,
  type AdminProductsQuery,
} from './admin-products-query';

export function AdminProductFilters({
  categories,
  query,
  showClear,
}: {
  categories: components['schemas']['AdminProductListFacetsDto']['categories'];
  query: AdminProductsQuery;
  showClear: boolean;
}) {
  return (
    <form
      action="/admin/products"
      aria-label="Filter products"
      className={styles.filters}
      method="get"
      role="search"
    >
      <Field
        className={styles.searchInput}
        defaultValue={query.search ?? ''}
        id="admin-product-search"
        label="Search products"
        maxLength={80}
        name="search"
        placeholder="Search products"
        type="search"
      />
      <fieldset className={styles.productTypes}>
        <legend>Product Type</legend>
        <div className={styles.productTypeList}>
          {categories.map((category) => (
            <label className={styles.productType} key={category.slug}>
              <input
                defaultChecked={query.category === category.slug}
                name="category"
                type="radio"
                value={category.slug}
              />
              <span>{category.name}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <Select
        className={styles.sortSelect}
        defaultValue={query.sort}
        id="admin-product-sort"
        label="Sort by"
        name="sort"
      >
        <option value="name-asc">Name: A to Z</option>
        <option value="name-desc">Name: Z to A</option>
        <option value="price-asc">Price: low to high</option>
        <option value="price-desc">Price: high to low</option>
      </Select>
      {query.minPriceMinor !== undefined ? (
        <input name="minPriceMinor" type="hidden" value={query.minPriceMinor} />
      ) : null}
      {query.maxPriceMinor !== undefined ? (
        <input name="maxPriceMinor" type="hidden" value={query.maxPriceMinor} />
      ) : null}
      {query.limit !== 12 ? (
        <input name="limit" type="hidden" value={query.limit} />
      ) : null}
      <Button type="submit">Apply</Button>
      {showClear ? (
        <Button href="/admin/products" variant="secondary">
          Clear filters
        </Button>
      ) : null}
      {query.category ? (
        <a href={buildAdminProductsHref(query, { category: undefined }, true)}>
          Clear product type
        </a>
      ) : null}
    </form>
  );
}
