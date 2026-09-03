import type { components } from '@hop-and-barley/api-client';
import Image from 'next/image';
import { CalendarBlank, PencilSimple } from '@phosphor-icons/react/dist/ssr';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Price } from '../../components/ui/price';
import { EmptyState, ErrorState } from '../../components/ui/status';
import { getVisiblePages } from '../catalog/catalog-pagination';
import {
  formatAdminStock,
  getLifecyclePresentation,
} from './admin-product-format';
import { AdminProductFilters } from './admin-product-filters';
import {
  buildAdminProductsHref,
  type AdminProductsQuery,
} from './admin-products-query';
import type { AdminProductsLoadResult } from './admin-products-server';
import { AdminShell } from './admin-shell';
import { isUploadedProductImagePath } from '../../lib/product-image';
import styles from './admin-products.module.css';

type AdminProduct = components['schemas']['AdminProductListItemDto'];

export function AdminProductsScreen({
  query,
  result,
}: {
  query: AdminProductsQuery;
  result: AdminProductsLoadResult;
}) {
  return (
    <AdminShell>
      {result.kind === 'loaded' ? (
        <AdminProductResults products={result.products} query={query} />
      ) : (
        <AdminProductsUnavailable query={query} />
      )}
    </AdminShell>
  );
}

function AdminProductResults({
  products,
  query,
}: {
  products: components['schemas']['AdminProductListResponseDto'];
  query: AdminProductsQuery;
}) {
  const { items, meta } = products;
  const hasFilters = Boolean(
    query.search ||
    query.category ||
    query.lifecycle ||
    query.minPriceMinor !== undefined ||
    query.maxPriceMinor !== undefined,
  );

  return (
    <>
      <header className={styles.pageHeader}>
        <div>
          <h1>Products</h1>
          <p aria-live="polite">
            {meta.totalItems} {meta.totalItems === 1 ? 'product' : 'products'}
          </p>
        </div>
        <p className={styles.today}>
          <CalendarBlank aria-hidden="true" size={20} />
          {new Intl.DateTimeFormat('en-GB', {
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          }).format(new Date())}
        </p>
      </header>
      <div className={styles.controls}>
        <AdminProductFilters
          categories={meta.facets.categories}
          query={query}
          showClear={hasFilters}
        />
        <Button href="/admin/add">+ Add product</Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          action={
            hasFilters ? (
              <Button href="/admin/products" variant="secondary">
                Clear filters
              </Button>
            ) : undefined
          }
          title="No products found"
        >
          There are no products matching this management view.
        </EmptyState>
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <caption className="visually-hidden">Product stock</caption>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">Price</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((product) => (
                  <AdminProductTableRow key={product.id} product={product} />
                ))}
              </tbody>
            </table>

            <ul aria-label="Product stock" className={styles.cards}>
              {items.map((product) => (
                <AdminProductCard key={product.id} product={product} />
              ))}
            </ul>
          </div>

          <AdminProductsPagination query={query} totalPages={meta.totalPages} />
        </>
      )}
    </>
  );
}

function AdminProductTableRow({ product }: { product: AdminProduct }) {
  const lifecycle = getLifecyclePresentation(product.lifecycleStatus);
  return (
    <tr>
      <td className={styles.productCell}>
        <Image
          alt=""
          className={styles.thumbnail}
          height={72}
          src={product.imagePath}
          unoptimized={isUploadedProductImagePath(product.imagePath)}
          width={72}
        />
        <span>
          <p className={styles.productName}>{product.name}</p>
          <span className={styles.subdetail}>{product.category.name}</span>
        </span>
      </td>
      <td>
        <Price currency={product.currency} minorUnits={product.priceMinor} />
        <span className={styles.subdetail}>{product.priceQualifier}</span>
      </td>
      <td>
        {formatAdminStock(
          product.stockAmount,
          product.saleKind,
          product.amountUnit,
        )}
      </td>
      <td>
        <Badge
          className={styles.lifecycleBadge}
          data-lifecycle={product.lifecycleStatus}
          tone={lifecycle.tone}
        >
          {lifecycle.label}
        </Badge>
      </td>
      <td>
        <Button
          className={styles.editButton}
          href={editHref(product.id)}
          variant="secondary"
        >
          <PencilSimple aria-hidden="true" size={18} /> Edit
        </Button>
      </td>
    </tr>
  );
}

function AdminProductCard({ product }: { product: AdminProduct }) {
  const lifecycle = getLifecyclePresentation(product.lifecycleStatus);
  return (
    <li className={styles.card}>
      <div className={styles.cardHeader}>
        <Image
          alt=""
          className={styles.thumbnail}
          height={64}
          src={product.imagePath}
          unoptimized={isUploadedProductImagePath(product.imagePath)}
          width={64}
        />
        <div className={styles.cardTitle}>
          <p className={styles.productName}>{product.name}</p>
          <p className={styles.description}>{product.category.name}</p>
        </div>
        <Badge
          className={styles.lifecycleBadge}
          data-lifecycle={product.lifecycleStatus}
          tone={lifecycle.tone}
        >
          {lifecycle.label}
        </Badge>
      </div>
      <dl>
        <div>
          <dt>Price</dt>
          <dd>
            <Price
              currency={product.currency}
              minorUnits={product.priceMinor}
            />{' '}
            <span>{product.priceQualifier}</span>
          </dd>
        </div>
        <div>
          <dt>Stock</dt>
          <dd>
            {formatAdminStock(
              product.stockAmount,
              product.saleKind,
              product.amountUnit,
            )}
          </dd>
        </div>
      </dl>
      <Button
        className={styles.editButton}
        href={editHref(product.id)}
        variant="secondary"
      >
        <PencilSimple aria-hidden="true" size={18} /> Edit
      </Button>
    </li>
  );
}

function AdminProductsPagination({
  query,
  totalPages,
}: {
  query: AdminProductsQuery;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const pages = getVisiblePages(query.page, totalPages);

  return (
    <nav aria-label="Product pages" className={styles.pageNavigation}>
      {query.page > 1 ? (
        <a href={buildAdminProductsHref(query, { page: query.page - 1 })}>
          Previous
        </a>
      ) : (
        <span aria-disabled="true">Previous</span>
      )}
      <ol>
        {pages.map((page, index) =>
          page === null ? (
            <li aria-hidden="true" key={`ellipsis-${index}`}>
              …
            </li>
          ) : (
            <li key={page}>
              {page === query.page ? (
                <span aria-current="page">{page}</span>
              ) : (
                <a href={buildAdminProductsHref(query, { page })}>{page}</a>
              )}
            </li>
          ),
        )}
      </ol>
      {query.page < totalPages ? (
        <a href={buildAdminProductsHref(query, { page: query.page + 1 })}>
          Next
        </a>
      ) : (
        <span aria-disabled="true">Next</span>
      )}
    </nav>
  );
}

function AdminProductsUnavailable({ query }: { query: AdminProductsQuery }) {
  return (
    <ErrorState
      action={<Button href={buildAdminProductsHref(query)}>Try again</Button>}
      title="Products unavailable"
    >
      We could not load product management safely. Please try again.
    </ErrorState>
  );
}

function editHref(id: string): string {
  return `/admin/add?productId=${encodeURIComponent(id)}`;
}
