import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCatalog } from '../lib/catalog';
import Home from './page';

vi.mock('../lib/catalog', () => ({ loadCatalog: vi.fn() }));
vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

const legacyProduct = {
  currency: 'USD' as const,
  description: 'Bright whole-cone hops',
  id: '20000000-0000-4000-8000-000000000004',
  name: 'Cascade Hops',
  priceMinor: 749,
  slug: 'cascade-hops',
};

const pagedProduct = {
  ...legacyProduct,
  availability: 'in-stock' as const,
  category: { name: 'Hops', slug: 'hops' },
  imagePath: '/assets/products/cascade-hops.webp' as const,
  priceQualifier: 'per 100g',
  teaser: 'Great for dry hopping',
};

beforeEach(() => vi.mocked(loadCatalog).mockReset());

describe('catalog page bridge', () => {
  it('renders the generated paged response through accepted primitives and assets', async () => {
    vi.mocked(loadCatalog).mockResolvedValue({
      catalog: {
        capabilities: { facets: 'available', pagination: 'available' },
        items: [pagedProduct],
        kind: 'paged',
        meta: {
          currency: 'USD',
          facets: { categories: [{ name: 'Hops', slug: 'hops' }] },
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
      },
      connected: true,
    });

    render(await Home());

    expect(screen.getByRole('status')).toHaveTextContent('API connected');
    expect(screen.getByRole('link', { name: 'Cascade Hops' })).toHaveAttribute(
      'href',
      '/product/cascade-hops',
    );
    expect(screen.getByRole('img', { name: 'Cascade hops' })).toHaveAttribute(
      'src',
      expect.stringContaining('/assets/products/cascade-hops.webp'),
    );
    expect(screen.getByText('In stock')).toBeVisible();
    expect(screen.getByText('per 100g')).toBeVisible();
  });

  it('renders the legacy branch without inventing availability or category facts', async () => {
    vi.mocked(loadCatalog).mockResolvedValue({
      catalog: {
        capabilities: { facets: 'unavailable', pagination: 'unavailable' },
        items: [legacyProduct],
        kind: 'legacy',
        meta: null,
      },
      connected: true,
    });

    render(await Home());

    expect(screen.getByText('Availability unavailable')).toBeVisible();
    expect(screen.queryByText('In stock')).not.toBeInTheDocument();
    expect(screen.queryByText('Hops')).not.toBeInTheDocument();
  });

  it('preserves the public unavailable state when transport or shape validation fails', async () => {
    vi.mocked(loadCatalog).mockResolvedValue({
      catalog: null,
      connected: false,
    });

    render(await Home());

    expect(screen.getByRole('status')).toHaveTextContent('API unavailable');
    expect(screen.getByRole('alert')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Products unavailable' }),
    ).toBeVisible();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });
});
