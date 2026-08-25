import { render, screen, within } from '@testing-library/react';
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
            { name: 'Yeast', slug: 'yeast' },
            { name: 'Adjuncts', slug: 'adjuncts' },
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
      screen.getByRole('img', {
        name: 'Close-up hop cones and green leaves',
      }),
    ).toHaveAttribute('src', '/assets/backgrounds/hops-field-hero.webp');
    expect(
      screen.getByRole('search', { name: 'Filter products' }),
    ).toHaveAttribute('action', '/');
    expect(
      screen.getByRole('radiogroup', { name: 'Product Type' }),
    ).toBeVisible();
    expect(screen.getByRole('radio', { name: 'Hops' })).not.toBeChecked();
    expect(screen.getByRole('link', { name: 'Cascade Hops' })).toHaveAttribute(
      'href',
      '/product/cascade-hops',
    );
    expect(screen.getByRole('img', { name: 'Cascade hops' })).toHaveAttribute(
      'src',
      '/assets/products/cascade-hops.webp',
    );
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
    expect(screen.getByRole('radio', { name: 'Hops' })).toBeChecked();
    expect(
      screen.getByRole('link', { name: 'Clear product type' }),
    ).toHaveAttribute(
      'href',
      '/?search=citrus+hops&minPriceMinor=400&maxPriceMinor=900&sort=price-desc&limit=24',
    );
    expect(screen.getByText('1 product found')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Clear filters' })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('keeps URL-only price and page-size state out of the primary controls', () => {
    render(
      <CatalogScreen
        query={{
          ...query,
          limit: 1,
          maxPriceMinor: 900,
          minPriceMinor: 400,
        }}
        result={pagedResult({
          meta: {
            ...extractPaged(pagedResult()).meta,
            filters: {
              category: null,
              maxPriceMinor: 900,
              minPriceMinor: 400,
              search: null,
            },
            limit: 1,
          },
        })}
      />,
    );

    expect(screen.queryByLabelText('Minimum price')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Maximum price')).not.toBeInTheDocument();
    expect(
      screen.queryByLabelText('Products per page'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('1 product found')).toBeVisible();
  });

  it('renders normalized keyword chips and one truthful product-type radio', () => {
    render(
      <CatalogScreen
        query={{
          ...query,
          category: 'malts',
          page: 3,
          search: 'citrus hops',
        }}
        result={pagedResult()}
      />,
    );

    const keywords = screen.getByRole('list', { name: 'Search keywords' });
    expect(within(keywords).getByText('citrus')).toBeVisible();
    expect(within(keywords).getByText('hops')).toBeVisible();
    expect(
      within(keywords).getByRole('link', { name: 'Remove keyword citrus' }),
    ).toHaveAttribute('href', '/?search=hops&category=malts');
    expect(
      within(keywords).getByRole('link', { name: 'Remove keyword hops' }),
    ).toHaveAttribute('href', '/?search=citrus&category=malts');

    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(screen.getByRole('radio', { name: 'Malt' })).toBeChecked();
    expect(
      screen.getByRole('link', { name: 'Clear product type' }),
    ).toHaveAttribute('href', '/?search=citrus+hops');
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByRole('radio', { name: 'Hops' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Yeast' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Adjuncts' })).not.toBeChecked();
  });

  it('exposes only the current name and price sort contract', () => {
    render(<CatalogScreen query={query} result={pagedResult()} />);

    const sort = screen.getByLabelText('Sort by');
    expect(
      within(sort).getByRole('option', { name: 'Name: A to Z' }),
    ).toBeVisible();
    expect(
      within(sort).getByRole('option', { name: 'Name: Z to A' }),
    ).toBeVisible();
    expect(
      within(sort).getByRole('option', { name: 'Price: low to high' }),
    ).toBeVisible();
    expect(
      within(sort).getByRole('option', { name: 'Price: high to low' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('option', { name: 'New' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: 'Rating' }),
    ).not.toBeInTheDocument();
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
