'use client';

import type { components } from '@hop-and-barley/api-client';

import { Field, Select } from '../../components/ui/field';
import styles from './admin-products.module.css';
import { type AdminProductsQuery } from './admin-products-query';

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
      <Select
        defaultValue={query.lifecycle ?? ''}
        id="admin-product-status"
        label="Status"
        name="lifecycle"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">All statuses</option>
        <option value="ACTIVE">Active</option>
        <option value="ENDING_SOON">Ending soon</option>
        <option value="DISABLED">Deactivated</option>
        <option value="SCHEDULED">Scheduled</option>
        <option value="EXPIRED">Expired</option>
      </Select>
      <Select
        defaultValue={query.category ?? ''}
        id="admin-product-category"
        label="Category"
        name="category"
        onChange={(event) => event.currentTarget.form?.requestSubmit()}
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.slug} value={category.slug}>
            {category.name}
          </option>
        ))}
      </Select>
      <input name="sort" type="hidden" value={query.sort} />
      {query.minPriceMinor !== undefined ? (
        <input name="minPriceMinor" type="hidden" value={query.minPriceMinor} />
      ) : null}
      {query.maxPriceMinor !== undefined ? (
        <input name="maxPriceMinor" type="hidden" value={query.maxPriceMinor} />
      ) : null}
      {query.limit !== 12 ? (
        <input name="limit" type="hidden" value={query.limit} />
      ) : null}
      <button className={styles.filterSubmit} type="submit">
        Search
      </button>
      {showClear ? (
        <a className={styles.clearFilters} href="/admin/products">
          Clear filters
        </a>
      ) : null}
    </form>
  );
}
