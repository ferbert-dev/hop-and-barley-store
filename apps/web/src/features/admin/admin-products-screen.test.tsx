import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AdminProductsScreen } from './admin-products-screen';

const query = { limit: 12, page: 2, sort: 'name-asc' as const };

const response = {
  items: [
    product('ACTIVE', true, 2),
    product('DISABLED', false, 3),
    product('SCHEDULED', true, 4),
    product('EXPIRED', true, 5),
  ],
  meta: {
    currency: 'USD' as const,
    facets: { categories: [{ name: 'Hops', slug: 'hops' }] },
    filters: {
      category: null,
      lifecycle: null,
      maxPriceMinor: null,
      minPriceMinor: null,
      search: null,
    },
    hasNextPage: true,
    hasPreviousPage: true,
    limit: 12,
    page: 2,
    sort: 'name-asc' as const,
    totalItems: 30,
    totalPages: 3,
  },
};

describe('admin product results', () => {
  it('keeps catalog controls and exposes the table and labelled mobile-card semantics', () => {
    render(
      <AdminProductsScreen
        query={query}
        result={{ kind: 'loaded', products: response }}
      />,
    );

    expect(
      screen.getByRole('search', { name: 'Filter products' }),
    ).toHaveAttribute('action', '/admin/products');
    expect(screen.getByRole('link', { name: '+ Add product' })).toHaveAttribute(
      'href',
      '/admin/add',
    );
    expect(screen.getByRole('columnheader', { name: 'Status' })).toBeVisible();
    expect(screen.getByRole('list', { name: 'Product stock' })).toBeVisible();
    expect(screen.getAllByText('Active')).toHaveLength(3);
    expect(screen.getAllByText('Deactivated')).toHaveLength(3);
    expect(screen.getAllByText('Scheduled')).toHaveLength(3);
    expect(screen.getAllByText('Expired')).toHaveLength(3);
    expect(screen.getAllByRole('link', { name: 'Edit' })[0]).toHaveAttribute(
      'href',
      '/admin/add?productId=20000000-0000-4000-8000-000000000002',
    );
    expect(
      screen.getByRole('navigation', { name: 'Product pages' }),
    ).toBeVisible();
  });

  it('shows an explicit empty state and preserves the add-product affordance', () => {
    render(
      <AdminProductsScreen
        query={{ ...query, page: 1 }}
        result={{
          kind: 'loaded',
          products: {
            ...response,
            items: [],
            meta: { ...response.meta, page: 1, totalItems: 0, totalPages: 0 },
          },
        }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('No products found');
    expect(screen.getByRole('link', { name: '+ Add product' })).toHaveAttribute(
      'href',
      '/admin/add',
    );
    expect(
      screen.getByRole('search', { name: 'Filter products' }),
    ).toBeVisible();
  });

  it('presents a recoverable error without adding mutation controls', () => {
    render(
      <AdminProductsScreen query={query} result={{ kind: 'unavailable' }} />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Products unavailable');
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute(
      'href',
      '/admin/products?page=2',
    );
  });
});

function product(
  lifecycleStatus: 'ACTIVE' | 'DISABLED' | 'SCHEDULED' | 'EXPIRED',
  isActive: boolean,
  idSuffix: number,
) {
  return {
    activeFrom:
      lifecycleStatus === 'SCHEDULED' ? '2026-08-29T10:00:00.000Z' : null,
    activeUntil:
      lifecycleStatus === 'EXPIRED' ? '2026-08-27T10:00:00.000Z' : null,
    amountUnit: 'MILLIGRAM' as const,
    category: { name: 'Hops', slug: 'hops' },
    createdAt: '2026-08-28T10:00:00.000Z',
    currency: 'USD' as const,
    description: 'Citrus and floral whole-cone hops.',
    imagePath: '/assets/products/cascade-hops.webp',
    id: `20000000-0000-4000-8000-${String(idSuffix).padStart(12, '0')}`,
    isActive,
    lifecycleStatus,
    name: 'Cascade Hops',
    priceMinor: 699,
    priceQualifier: 'per 100g',
    saleKind: 'WEIGHT' as const,
    slug: 'cascade-hops',
    stockAmount: 100_000_000,
    updatedAt: '2026-08-28T10:00:00.000Z',
  };
}
