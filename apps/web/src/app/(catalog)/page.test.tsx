import { render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loadCatalog } from '../../lib/catalog';
import CatalogPage, { generateMetadata } from './page';

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('../../lib/catalog', () => ({ loadCatalog: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect,
  useRouter: () => ({ replace: vi.fn() }),
}));
vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt ?? ''} {...props} />
  ),
}));

const pagedResult = {
  catalog: {
    capabilities: {
      facets: 'available' as const,
      pagination: 'available' as const,
    },
    items: [],
    kind: 'paged' as const,
    meta: {
      currency: 'EUR' as const,
      facets: { categories: [{ count: 1, name: 'Hops', slug: 'hops' }] },
      filters: {
        category: [],
        maxPriceMinor: null,
        minPriceMinor: null,
        search: null,
      },
      hasNextPage: false,
      hasPreviousPage: false,
      limit: 12,
      page: 1,
      sort: 'name-asc' as const,
      totalItems: 0,
      totalPages: 0,
    },
  },
  connected: true as const,
};

beforeEach(() => {
  redirect.mockClear();
  vi.mocked(loadCatalog).mockReset().mockResolvedValue(pagedResult);
});

describe('catalog route', () => {
  it('loads a canonical URL through the typed query contract', async () => {
    render(await CatalogPage({ searchParams: Promise.resolve({}) }));

    expect(loadCatalog).toHaveBeenCalledWith({
      limit: 12,
      page: 1,
      sort: 'name-asc',
    });
    expect(screen.getByText('API connected')).toBeVisible();
  });

  it('redirects valid noncanonical URLs before contacting the API', async () => {
    await expect(
      CatalogPage({
        searchParams: Promise.resolve({ search: '  Citra   hops ' }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/?search=Citra+hops');

    expect(loadCatalog).not.toHaveBeenCalled();
  });

  it('canonicalizes a multi-category URL when the API is the immediate predecessor', async () => {
    vi.mocked(loadCatalog).mockResolvedValue({
      connected: true,
      catalog: {
        ...pagedResult.catalog,
        kind: 'paged-predecessor',
        meta: {
          ...pagedResult.catalog.meta,
          facets: { categories: [{ name: 'Hops', slug: 'hops' }] },
          filters: {
            ...pagedResult.catalog.meta.filters,
            category: ['hops'],
          },
        },
      },
    });

    await expect(
      CatalogPage({
        searchParams: Promise.resolve({ category: ['hops', 'malts'] }),
      }),
    ).rejects.toThrow('NEXT_REDIRECT:/?category=hops');
  });

  it('fails closed for invalid URLs without contacting the API', async () => {
    render(
      await CatalogPage({
        searchParams: Promise.resolve({ search: ['hops', 'malts'] }),
      }),
    );

    expect(loadCatalog).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('API not contacted');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Only Product Type may appear more than once.',
    );
    expect(
      screen.getByRole('link', { name: 'Clear catalog URL' }),
    ).toHaveAttribute('href', '/');
  });

  it('provides distinct metadata for default, filtered, paged, and invalid URLs', async () => {
    await expect(
      generateMetadata({ searchParams: Promise.resolve({}) }),
    ).resolves.toMatchObject({
      title: 'Shop brewing ingredients | Hop & Barley',
    });
    await expect(
      generateMetadata({ searchParams: Promise.resolve({ search: 'Citra' }) }),
    ).resolves.toMatchObject({ title: 'Citra — Hop & Barley products' });
    await expect(
      generateMetadata({ searchParams: Promise.resolve({ page: '2' }) }),
    ).resolves.toMatchObject({
      title: 'Shop brewing ingredients — Page 2 | Hop & Barley',
    });
    await expect(
      generateMetadata({ searchParams: Promise.resolve({ page: '201' }) }),
    ).resolves.toMatchObject({ title: 'Invalid catalog URL | Hop & Barley' });
  });
});
