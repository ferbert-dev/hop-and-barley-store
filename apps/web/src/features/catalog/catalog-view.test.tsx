import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { CatalogLoadResult } from '../../lib/catalog';
import { CatalogScreen } from './catalog-screen';
import type { CatalogQuery } from './catalog-query';

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

const query: CatalogQuery = { limit: 12, page: 1, sort: 'name-asc' };
const product = {
  availability: 'in-stock' as const,
  category: { name: 'Hops', slug: 'hops' },
  currency: 'USD' as const,
  description: 'Bright whole-cone hops',
  id: '20000000-0000-4000-8000-000000000002',
  imagePath: '/assets/products/cascade-hops.webp',
  name: 'Cascade Hops',
  priceMinor: 749,
  priceQualifier: 'per 100g',
  slug: 'cascade-hops',
  teaser: 'Citrus and floral whole-cone hops.',
};

type PagedCatalogResult = Extract<
  NonNullable<Extract<CatalogLoadResult, { connected: true }>['catalog']>,
  { kind: 'paged' }
>;

function pagedResult(
  overrides: Partial<PagedCatalogResult> = {},
): CatalogLoadResult {
  return {
    catalog: {
      capabilities: { facets: 'available', pagination: 'available' },
      items: [product],
      kind: 'paged',
      meta: {
        currency: 'USD',
        facets: {
          categories: [
            { name: 'Hops', slug: 'hops' },
            { name: 'Malts', slug: 'malts' },
          ],
        },
        filters: {
          category: null,
          maxPriceMinor: null,
          minPriceMinor: null,
          search: null,
        },
        hasNextPage: false,
        hasPreviousPage: false,
        limit: 12,
        page: 1,
        sort: 'name-asc',
        totalItems: 1,
        totalPages: 1,
      },
      ...overrides,
    },
    connected: true,
  };
}

describe('catalog discovery screen', () => {
  it('renders the generated paged response through URL-backed controls and D3 cards', () => {
    render(<CatalogScreen query={query} result={pagedResult()} />);

    expect(screen.getByRole('status')).toHaveTextContent('API connected');
    expect(
      screen.getByRole('search', { name: 'Filter products' }),
    ).toHaveAttribute('action', '/');
    expect(screen.getByLabelText('Category')).toHaveDisplayValue(
      'All categories',
    );
    expect(screen.getByRole('option', { name: 'Hops' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Cascade Hops' })).toHaveAttribute(
      'href',
      '/product/cascade-hops',
    );
    expect(screen.getByRole('img', { name: 'Cascade hops' })).toHaveAttribute(
      'src',
      '/assets/products/cascade-hops.webp',
    );
    expect(screen.getByText('In stock')).toBeVisible();
    expect(screen.getByText('per 100g')).toBeVisible();
  });

  it('renders filtered query values, a result summary, and canonical clear link', () => {
    render(
      <CatalogScreen
        query={{
          category: 'hops',
          limit: 24,
          maxPriceMinor: 900,
          minPriceMinor: 400,
          page: 1,
          search: 'citrus hops',
          sort: 'price-desc',
        }}
        result={pagedResult()}
      />,
    );

    expect(screen.getByLabelText('Search products')).toHaveValue('citrus hops');
    expect(screen.getByLabelText('Category')).toHaveValue('hops');
    expect(screen.getByText('1 product found')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('represents every valid URL limit even when it is not a suggested value', () => {
    render(
      <CatalogScreen query={{ ...query, limit: 1 }} result={pagedResult()} />,
    );

    expect(screen.getByLabelText('Products per page')).toHaveValue('1');
    expect(screen.getByRole('option', { name: '1' })).toBeVisible();
  });

  it('distinguishes no matches from an out-of-range page', () => {
    const noMatches = pagedResult({
      items: [],
      meta: {
        ...extractPaged(pagedResult()).meta,
        filters: {
          category: 'hops',
          maxPriceMinor: null,
          minPriceMinor: null,
          search: 'missing',
        },
        totalItems: 0,
        totalPages: 0,
      },
    });
    const { rerender } = render(
      <CatalogScreen
        query={{ ...query, category: 'hops', search: 'missing' }}
        result={noMatches}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'No products match these filters' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toBeVisible();

    rerender(
      <CatalogScreen
        query={{ ...query, page: 3 }}
        result={pagedResult({
          items: [],
          meta: {
            ...extractPaged(pagedResult()).meta,
            page: 3,
            totalItems: 12,
            totalPages: 1,
          },
        })}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'This catalog page is empty' }),
    ).toBeVisible();
    expect(
      screen.getByRole('link', { name: 'Go to first page' }),
    ).toHaveAttribute('href', '/');
  });

  it('preserves an honest legacy rollback state without filter capabilities', () => {
    render(
      <CatalogScreen
        query={query}
        result={{
          catalog: {
            capabilities: { facets: 'unavailable', pagination: 'unavailable' },
            items: [
              {
                currency: 'USD',
                description: product.description,
                id: product.id,
                name: product.name,
                priceMinor: product.priceMinor,
                slug: product.slug,
              },
            ],
            kind: 'legacy',
            meta: null,
          },
          connected: true,
        }}
      />,
    );

    expect(screen.queryByRole('search')).not.toBeInTheDocument();
    expect(
      screen.getByText(/filtering and paging are temporarily unavailable/i),
    ).toBeVisible();
    expect(screen.getByText('Availability unavailable')).toBeVisible();
  });

  it('renders the safe API-unavailable state with a retry link', () => {
    render(
      <CatalogScreen
        query={{ ...query, category: 'hops' }}
        result={{ catalog: null, connected: false }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('API unavailable');
    expect(screen.getByRole('region', { name: 'Catalog' })).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Products unavailable' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute(
      'href',
      '/?category=hops',
    );
  });

  it('fails closed when the API image path drifts from the local manifest', () => {
    expect(() =>
      render(
        <CatalogScreen
          query={query}
          result={pagedResult({
            items: [
              { ...product, imagePath: '/assets/products/mosaic-hops.webp' },
            ],
          })}
        />,
      ),
    ).toThrow(/catalog asset contract/i);
  });
});

function extractPaged(result: CatalogLoadResult) {
  if (!result.connected || result.catalog.kind !== 'paged') {
    throw new TypeError('Expected a paged fixture');
  }
  return result.catalog;
}
