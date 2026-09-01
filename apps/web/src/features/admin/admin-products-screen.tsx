import type { components } from '@hop-and-barley/api-client';

import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Price } from '../../components/ui/price';
import { EmptyState, ErrorState } from '../../components/ui/status';
import { getVisiblePages } from '../catalog/catalog-pagination';
import {
  formatActivationWindow,
  formatAdminStock,
  formatUtc,
  getLifecyclePresentation,
} from './admin-product-format';
import { AdminProductFilters } from './admin-product-filters';
import {
  buildAdminProductsHref,
  type AdminProductsQuery,
} from './admin-products-query';
import type { AdminProductsLoadResult } from './admin-products-server';
import { AdminShell } from './admin-shell';
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
    query.minPriceMinor !== undefined ||
    query.maxPriceMinor !== undefined,
  );

  return (
    <>
      <AdminProductFilters
        categories={meta.facets.categories}
        query={query}
        showClear={hasFilters}
      />
      <div className={styles.toolbar}>
        <p aria-live="polite">
          {meta.totalItems} {meta.totalItems === 1 ? 'product' : 'products'}
        </p>
        <Button href="/admin/add">+ Add Product</Button>
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
                  <th scope="col">ID</th>
                  <th scope="col">Name</th>
                  <th scope="col">Description</th>
                  <th scope="col">Price</th>
                  <th scope="col">Category</th>
                  <th scope="col">Stock</th>
                  <th scope="col">Lifecycle</th>
                  <th scope="col">Activation window</th>
                  <th scope="col">Created at</th>
                  <th scope="col">Updated at</th>
                  <th scope="col">
                    <span className="visually-hidden">Actions</span>
                  </th>
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
      <td>
        <code>{product.id}</code>
      </td>
      <td>
        <p className={styles.productName}>{product.name}</p>
      </td>
      <td>
        <p className={styles.description}>{product.description}</p>
      </td>
      <td>
        <Price currency={product.currency} minorUnits={product.priceMinor} />
        <span className={styles.subdetail}>{product.priceQualifier}</span>
      </td>
      <td>{product.category.name}</td>
      <td>
        {formatAdminStock(
          product.stockAmount,
          product.saleKind,
          product.amountUnit,
        )}
      </td>
      <td>
        <Badge tone={lifecycle.tone}>{lifecycle.label}</Badge>
      </td>
      <td>
        <span>
          {formatActivationWindow(product.activeFrom, product.activeUntil)}
        </span>
        <span className={styles.subdetail}>
          {product.isActive ? 'Manually enabled' : 'Manually disabled'}
        </span>
      </td>
      <td>
        <time dateTime={product.createdAt}>{formatUtc(product.createdAt)}</time>
      </td>
      <td>
        <time dateTime={product.updatedAt}>{formatUtc(product.updatedAt)}</time>
      </td>
      <td>
        <Button href={editHref(product.id)} variant="secondary">
          Edit
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
        <div>
          <p className={styles.productName}>{product.name}</p>
          <p className={styles.description}>{product.description}</p>
        </div>
        <Badge tone={lifecycle.tone}>{lifecycle.label}</Badge>
      </div>
      <dl>
        <div>
          <dt>ID</dt>
          <dd>
            <code>{product.id}</code>
          </dd>
        </div>
        <div>
          <dt>Lifecycle</dt>
          <dd>{lifecycle.label}</dd>
        </div>
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
          <dt>Category</dt>
          <dd>{product.category.name}</dd>
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
        <div>
          <dt>Activation window</dt>
          <dd>
            {formatActivationWindow(product.activeFrom, product.activeUntil)} (
            {product.isActive ? 'manually enabled' : 'manually disabled'})
          </dd>
        </div>
        <div>
          <dt>Created at</dt>
          <dd>
            <time dateTime={product.createdAt}>
              {formatUtc(product.createdAt)}
            </time>
          </dd>
        </div>
        <div>
          <dt>Updated at</dt>
          <dd>
            <time dateTime={product.updatedAt}>
              {formatUtc(product.updatedAt)}
            </time>
          </dd>
        </div>
      </dl>
      <Button href={editHref(product.id)} variant="secondary">
        Edit
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
