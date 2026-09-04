import { act, fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { CatalogLoadResult } from '../../lib/catalog';
import { CatalogScreen } from './catalog-screen';
import type { CatalogQuery } from './catalog-query';

const { replace } = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));
vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

afterEach(() => {
  replace.mockReset();
  vi.useRealTimers();
});

const query: CatalogQuery = { limit: 12, page: 1, sort: 'name-asc' };
const product = {
  availability: 'in-stock' as const,
  category: { name: 'Hops', slug: 'hops' },
  currency: 'EUR' as const,
  description: 'Bright whole-cone hops',
  id: '20000000-0000-4000-8000-000000000002',
  imagePath: '/assets/products/cascade-hops.webp',
  kitYieldVolumeMl: null,
  maximumOrderAmount: 100_000_000,
  minimumOrderAmount: 100_000,
  name: 'Cascade Hops',
  orderStepAmount: 100_000,
  packageNetWeightMg: null,
  priceBasisAmount: 100_000,
  priceMinor: 749,
  priceQualifier: 'per 100g',
  slug: 'cascade-hops',
  saleKind: 'WEIGHT' as const,
  stockAmount: 100_000_000,
  amountUnit: 'MILLIGRAM' as const,
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
        currency: 'EUR',
        facets: {
          categories: [
            { count: 3, name: 'Hops', slug: 'hops' },
            { count: 4, name: 'Malts', slug: 'malts' },
            { count: 2, name: 'Yeast', slug: 'yeast' },
            { count: 0, name: 'Adjuncts', slug: 'adjuncts' },
          ],
        },
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
  it('renders compact controls and clickable product media', () => {
    render(<CatalogScreen query={query} result={pagedResult()} />);

    expect(
      screen.getByRole('heading', { name: 'Find your ingredients' }),
    ).toBeVisible();
    expect(screen.queryByText('From the database')).not.toBeInTheDocument();
    expect(screen.queryByText('Current selection')).not.toBeInTheDocument();
    expect(
      screen.getByRole('search', { name: 'Search products' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Filters' })).toBeVisible();
    expect(screen.getByText('€7.49')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Sort by: Name A–Z' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cascade Hops' })).toHaveAttribute(
      'href',
      '/product/cascade-hops',
    );
    expect(
      screen.getByRole('link', { name: 'View Cascade Hops details' }),
    ).toHaveAttribute('href', '/product/cascade-hops');
  });

  it('runs search after a short debounce without an apply action', () => {
    vi.useFakeTimers();
    render(<CatalogScreen query={query} result={pagedResult()} />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'citra hops' },
    });
    expect(replace).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledWith('/?search=citra+hops', {
      scroll: false,
    });
  });

  it('keeps results during debounce, then shows skeletons until search results arrive', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <CatalogScreen query={query} result={pagedResult()} />,
    );

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Ca' },
    });

    expect(screen.getByRole('link', { name: 'Cascade Hops' })).toBeVisible();
    expect(
      screen.queryByRole('status', { name: 'Searching products' }),
    ).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(299));
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Cascade Hops' })).toBeVisible();

    act(() => vi.advanceTimersByTime(1));
    const loadingStatuses = screen.getAllByRole('status', {
      name: 'Searching products',
    });
    expect(loadingStatuses).toHaveLength(1);
    expect(loadingStatuses[0]).toBeVisible();
    expect(loadingStatuses[0]?.closest('[aria-busy="true"]')).toBeNull();
    expect(screen.getAllByTestId('catalog-product-skeleton')).toHaveLength(8);
    expect(
      screen.queryByRole('link', { name: 'Cascade Hops' }),
    ).not.toBeInTheDocument();

    rerender(
      <CatalogScreen
        query={{ ...query, search: 'Ca' }}
        result={pagedResult()}
      />,
    );
    expect(
      screen.queryByRole('status', { name: 'Searching products' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cascade Hops' })).toBeVisible();
  });

  it('automatically restores all products when the search is cleared', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <CatalogScreen query={query} result={pagedResult()} />,
    );

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Ca' },
    });
    act(() => vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenLastCalledWith('/?search=Ca', { scroll: false });

    rerender(
      <CatalogScreen
        query={{ ...query, search: 'Ca' }}
        result={pagedResult()}
      />,
    );
    replace.mockClear();
    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '' },
    });

    expect(replace).toHaveBeenCalledWith('/', { scroll: false });
    expect(
      screen.getByRole('status', { name: 'Searching products' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Cascade Hops' }),
    ).not.toBeInTheDocument();

    rerender(<CatalogScreen query={query} result={pagedResult()} />);
    expect(
      screen.queryByRole('status', { name: 'Searching products' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cascade Hops' })).toBeVisible();
  });

  it('supersedes an in-flight search when cleared before URL props commit', () => {
    vi.useFakeTimers();
    render(<CatalogScreen query={query} result={pagedResult()} />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Ca' },
    });
    act(() => vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenLastCalledWith('/?search=Ca', { scroll: false });

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: '' },
    });
    expect(replace).toHaveBeenLastCalledWith('/', { scroll: false });
  });

  it('syncs search and title when URL-owned query props change', () => {
    vi.useFakeTimers();
    const { rerender } = render(
      <CatalogScreen
        query={{ ...query, search: 'Citra' }}
        result={pagedResult()}
      />,
    );
    expect(screen.getByRole('searchbox')).toHaveValue('Citra');
    expect(document.title).toBe('Citra — Hop & Barley products');

    rerender(<CatalogScreen query={query} result={pagedResult()} />);

    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(document.title).toBe('Shop brewing ingredients | Hop & Barley');
    act(() => vi.advanceTimersByTime(300));
    expect(replace).not.toHaveBeenCalled();
  });

  it('stages dynamic product types and closes the drawer after Apply', () => {
    render(<CatalogScreen query={query} result={pagedResult()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(dialog).toHaveAttribute('open');
    expect(
      within(dialog).queryByText('Selected filters'),
    ).not.toBeInTheDocument();
    expect(within(dialog).getByText('3')).toBeVisible();

    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Hops/ }));
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Malts/ }));
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Apply filters' }),
    );

    expect(dialog).not.toHaveAttribute('open');
    expect(replace).toHaveBeenCalledWith('/?category=hops&category=malts', {
      scroll: false,
    });
  });

  it('applies sorting immediately to the current search result', () => {
    render(
      <CatalogScreen
        query={{ ...query, category: ['hops'], search: 'citra hops' }}
        result={pagedResult()}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Sort by: Name A–Z' }));
    fireEvent.click(screen.getByRole('link', { name: 'Price high to low' }));

    expect(replace).toHaveBeenCalledWith(
      '/?search=citra+hops&category=hops&sort=price-desc',
      { scroll: false },
    );
    expect(
      screen
        .getByRole('button', { name: 'Sort by: Name A–Z' })
        .closest('details'),
    ).not.toHaveAttribute('open');
  });

  it('exposes canonical sort links and restores focus when dismissed', () => {
    render(<CatalogScreen query={query} result={pagedResult()} />);

    const trigger = screen.getByRole('button', {
      name: 'Sort by: Name A–Z',
    });
    fireEvent.click(trigger);

    expect(screen.getByRole('link', { name: 'Name Z–A' })).toHaveAttribute(
      'href',
      '/?sort=name-desc',
    );
    expect(trigger.closest('details')).toHaveAttribute('open');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(trigger.closest('details')).not.toHaveAttribute('open');
    expect(trigger).toHaveFocus();
  });

  it('cancels a pending search and includes it in immediate sorting', () => {
    vi.useFakeTimers();
    render(<CatalogScreen query={query} result={pagedResult()} />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Citra' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sort by: Name A–Z' }));
    fireEvent.click(screen.getByRole('link', { name: 'Price high to low' }));

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/?search=Citra&sort=price-desc', {
      scroll: false,
    });
    act(() => vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('cancels a pending search and includes it when filters are applied', () => {
    vi.useFakeTimers();
    render(<CatalogScreen query={query} result={pagedResult()} />);

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Citra' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(dialog).queryByText('Sort')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /Hops/ }));
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Apply filters' }),
    );

    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace).toHaveBeenCalledWith('/?search=Citra&category=hops', {
      scroll: false,
    });
    act(() => vi.advanceTimersByTime(300));
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('limits predecessor rollback facets to one product type', () => {
    const current = extractPaged(pagedResult());
    render(
      <CatalogScreen
        query={query}
        result={{
          catalog: {
            ...current,
            kind: 'paged-predecessor',
            meta: {
              ...current.meta,
              facets: {
                categories: current.meta.facets.categories.map(
                  ({ name, slug }) => ({ name, slug }),
                ),
              },
            },
          },
          connected: true,
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    const dialog = screen.getByRole('dialog', { name: 'Filters' });
    expect(within(dialog).getByText('Select one product type')).toBeVisible();
    expect(within(dialog).queryByText('3')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('radio', { name: /Hops/ }));
    fireEvent.click(within(dialog).getByRole('radio', { name: /Malts/ }));
    fireEvent.click(
      within(dialog).getByRole('button', { name: 'Apply filters' }),
    );

    expect(replace).toHaveBeenCalledWith('/?category=malts', {
      scroll: false,
    });
  });

  it('distinguishes no matches from an out-of-range page', () => {
    const noMatches = pagedResult({
      items: [],
      meta: {
        ...extractPaged(pagedResult()).meta,
        filters: {
          category: ['hops'],
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
        query={{ ...query, category: ['hops'], search: 'missing' }}
        result={noMatches}
      />,
    );

    expect(
      screen.getByRole('heading', { name: 'No products match these filters' }),
    ).toBeVisible();

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
  });

  it('preserves the API-unavailable and legacy rollback states', () => {
    const { rerender } = render(
      <CatalogScreen
        query={{ ...query, category: ['hops'] }}
        result={{ catalog: null, connected: false }}
      />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('API unavailable');
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute(
      'href',
      '/?category=hops',
    );

    rerender(
      <CatalogScreen
        query={query}
        result={{
          catalog: {
            capabilities: { facets: 'unavailable', pagination: 'unavailable' },
            items: [
              {
                currency: 'EUR',
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
});

function extractPaged(result: CatalogLoadResult) {
  if (!result.connected || result.catalog.kind !== 'paged') {
    throw new TypeError('Expected a paged fixture');
  }
  return result.catalog;
}
