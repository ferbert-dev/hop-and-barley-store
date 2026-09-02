'use client';

import type { CompatibleCatalogCategoryFacet } from '@hop-and-barley/api-client';
import {
  CaretDown,
  Check,
  CircleNotch,
  MagnifyingGlass,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import { Button } from '../../components/ui/button';
import {
  buildCatalogHref,
  buildCatalogTitle,
  type CatalogQuery,
} from './catalog-query';
import { useCatalogSearchTransition } from './catalog-search-transition';
import styles from './catalog.module.css';

type CatalogHrefBuilder = (
  current: CatalogQuery,
  overrides?: Partial<CatalogQuery>,
  resetPage?: boolean,
) => string;

const SEARCH_DEBOUNCE_MS = 300;
const SORT_OPTIONS = [
  { label: 'Name A–Z', value: 'name-asc' },
  { label: 'Name Z–A', value: 'name-desc' },
  { label: 'Price low to high', value: 'price-asc' },
  { label: 'Price high to low', value: 'price-desc' },
] as const satisfies ReadonlyArray<{
  label: string;
  value: CatalogQuery['sort'];
}>;

export function CatalogControls({
  buildHref = buildCatalogHref,
  categorySelection = 'multiple',
  categories,
  query,
}: {
  buildHref?: CatalogHrefBuilder;
  categorySelection?: 'multiple' | 'single';
  categories: CompatibleCatalogCategoryFacet[];
  query: CatalogQuery;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const filterButtonRef = useRef<HTMLButtonElement>(null);
  const sortControlRef = useRef<HTMLDetailsElement>(null);
  const sortSummaryRef = useRef<HTMLElement>(null);
  const searchTimeoutRef = useRef<number | null>(null);
  const immediateSearchRef = useRef<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftCategories, setDraftCategories] = useState<string[]>(
    query.category ?? [],
  );
  const activeSearch = query.search ?? '';
  const [searchState, setSearchState] = useState({
    query: activeSearch,
    value: activeSearch,
  });
  if (searchState.query !== activeSearch) {
    setSearchState({ query: activeSearch, value: activeSearch });
  }
  const search = searchState.value;
  const [isPending, startTransition] = useTransition();
  const { beginSearch } = useCatalogSearchTransition();
  const catalogTitle = buildCatalogTitle(query);
  const normalizedSearch = normalizeSearch(search);
  const isSearchUpdating =
    isSearchReady(normalizedSearch) && normalizedSearch !== activeSearch;

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (drawerOpen && !dialog.open) dialog.showModal();
    if (!drawerOpen && dialog.open) dialog.close();
  }, [drawerOpen]);

  useEffect(() => {
    document.title = catalogTitle;
  }, [catalogTitle]);

  useEffect(() => {
    function closeSortOnOutsidePointer(event: PointerEvent) {
      const control = sortControlRef.current;
      if (
        !control?.open ||
        !(event.target instanceof Node) ||
        control.contains(event.target)
      ) {
        return;
      }
      control.open = false;
    }

    function closeSortOnEscape(event: KeyboardEvent) {
      const control = sortControlRef.current;
      if (event.key !== 'Escape' || !control?.open) return;
      event.preventDefault();
      control.open = false;
      sortSummaryRef.current?.focus();
    }

    document.addEventListener('pointerdown', closeSortOnOutsidePointer);
    document.addEventListener('keydown', closeSortOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeSortOnOutsidePointer);
      document.removeEventListener('keydown', closeSortOnEscape);
    };
  }, []);

  useEffect(() => {
    const normalized = normalizeSearch(search);
    if (normalized === activeSearch) {
      immediateSearchRef.current = null;
      return;
    }
    if (normalized === immediateSearchRef.current) return;
    if (!isSearchReady(normalized)) return;

    const timeout = window.setTimeout(() => {
      searchTimeoutRef.current = null;
      immediateSearchRef.current = normalized;
      beginSearch(normalized);
      startTransition(() => {
        router.replace(
          buildHref(
            query,
            { search: normalized.length === 0 ? undefined : normalized },
            true,
          ),
          { scroll: false },
        );
      });
    }, SEARCH_DEBOUNCE_MS);
    searchTimeoutRef.current = timeout;

    return () => {
      window.clearTimeout(timeout);
      if (searchTimeoutRef.current === timeout) searchTimeoutRef.current = null;
    };
  }, [activeSearch, beginSearch, buildHref, query, router, search]);

  function openDrawer() {
    setDraftCategories(query.category ?? []);
    setDrawerOpen(true);
  }

  function updateSearch(value: string) {
    setSearchState((current) => ({ ...current, value }));

    if (normalizeSearch(value).length !== 0) return;

    const requestedSearch = immediateSearchRef.current;
    cancelPendingSearch();
    if (
      activeSearch.length === 0 &&
      (requestedSearch === null || requestedSearch.length === 0)
    ) {
      immediateSearchRef.current = null;
      return;
    }

    immediateSearchRef.current = '';
    beginSearch('');
    startTransition(() => {
      router.replace(buildHref(query, { search: undefined }, true), {
        scroll: false,
      });
    });
  }

  function closeDrawer() {
    setDrawerOpen(false);
    window.setTimeout(() => filterButtonRef.current?.focus(), 0);
  }

  function applyFilters() {
    const selectedCategories =
      categorySelection === 'single'
        ? draftCategories.slice(0, 1)
        : draftCategories;
    closeDrawer();
    cancelPendingSearch();
    const searchOverride = getSearchOverride();
    immediateSearchRef.current = searchOverride ?? '';
    if ((searchOverride ?? '') !== activeSearch) {
      beginSearch(searchOverride ?? '');
    }
    startTransition(() => {
      router.replace(
        buildHref(
          query,
          {
            category:
              selectedCategories.length === 0
                ? undefined
                : selectedCategories.toSorted(),
            search: searchOverride,
          },
          true,
        ),
        { scroll: false },
      );
    });
  }

  function applySort(sort: CatalogQuery['sort']) {
    if (sortControlRef.current) sortControlRef.current.open = false;
    sortSummaryRef.current?.focus();
    if (sort === query.sort) return;

    cancelPendingSearch();
    const searchOverride = getSearchOverride();
    immediateSearchRef.current = searchOverride ?? '';
    if ((searchOverride ?? '') !== activeSearch) {
      beginSearch(searchOverride ?? '');
    }
    startTransition(() => {
      router.replace(buildHref(query, { search: searchOverride, sort }, true), {
        scroll: false,
      });
    });
  }

  function cancelPendingSearch() {
    if (searchTimeoutRef.current === null) return;
    window.clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = null;
  }

  function getSearchOverride(): string | undefined {
    const normalized = normalizeSearch(search);
    if (!isSearchReady(normalized)) return query.search;
    return normalized.length === 0 ? undefined : normalized;
  }

  function toggleCategory(slug: string) {
    if (categorySelection === 'single') {
      setDraftCategories([slug]);
      return;
    }
    setDraftCategories((current) =>
      current.includes(slug)
        ? current.filter((category) => category !== slug)
        : [...current, slug],
    );
  }

  const selectedCount = query.category?.length ?? 0;
  const selectedSort =
    SORT_OPTIONS.find((option) => option.value === query.sort) ??
    SORT_OPTIONS[0];

  return (
    <section aria-label="Catalog discovery controls" className={styles.filters}>
      <form
        aria-label="Search products"
        aria-busy={isSearchUpdating}
        className={styles.searchForm}
        onSubmit={(event) => event.preventDefault()}
        role="search"
      >
        <MagnifyingGlass aria-hidden="true" size={24} weight="regular" />
        <label className="visually-hidden" htmlFor="catalog-search">
          Search products
        </label>
        <input
          autoComplete="off"
          className={styles.searchInput}
          id="catalog-search"
          maxLength={80}
          onChange={(event) => updateSearch(event.currentTarget.value)}
          placeholder="Search products by name"
          type="search"
          value={search}
        />
        {isSearchUpdating ? (
          <span aria-hidden="true" className={styles.searchProgress}>
            <CircleNotch
              className={styles.searchSpinner}
              size={18}
              weight="bold"
            />
          </span>
        ) : null}
      </form>

      <button
        aria-expanded={drawerOpen}
        aria-haspopup="dialog"
        className={styles.filterTrigger}
        onClick={openDrawer}
        ref={filterButtonRef}
        type="button"
      >
        <SlidersHorizontal aria-hidden="true" size={22} weight="regular" />
        <span>Filters</span>
        {selectedCount > 0 ? (
          <span aria-label={`${String(selectedCount)} selected`}>
            · {selectedCount}
          </span>
        ) : null}
      </button>

      <details className={styles.sortControl} ref={sortControlRef}>
        <summary
          aria-label={`Sort by: ${selectedSort.label}`}
          className={styles.sortSummary}
          ref={sortSummaryRef}
          role="button"
        >
          <span>Sort: {selectedSort.label}</span>
          <CaretDown
            aria-hidden="true"
            className={styles.sortChevron}
            size={18}
            weight="bold"
          />
        </summary>
        <nav aria-label="Sort products" className={styles.sortMenu}>
          <ul>
            {SORT_OPTIONS.map((option) => (
              <li key={option.value}>
                <a
                  aria-current={
                    option.value === query.sort ? 'true' : undefined
                  }
                  className={styles.sortOption}
                  href={buildHref(query, { sort: option.value }, true)}
                  onClick={(event) => {
                    event.preventDefault();
                    applySort(option.value);
                  }}
                >
                  <span>{option.label}</span>
                  {option.value === query.sort ? (
                    <Check aria-hidden="true" size={18} weight="bold" />
                  ) : null}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </details>

      <dialog
        aria-labelledby="catalog-filter-title"
        className={styles.filterDrawer}
        onCancel={(event) => {
          event.preventDefault();
          closeDrawer();
        }}
        onClose={() => setDrawerOpen(false)}
        ref={dialogRef}
      >
        <div className={styles.drawerHeader}>
          <h3 id="catalog-filter-title">Filters</h3>
          <button
            aria-label="Close filters"
            className={styles.drawerClose}
            onClick={closeDrawer}
            type="button"
          >
            <X aria-hidden="true" size={24} weight="regular" />
          </button>
        </div>

        <fieldset className={styles.productTypes}>
          <legend>Product Type</legend>
          <p className={styles.filterLogic}>
            {categorySelection === 'single'
              ? 'Select one product type'
              : 'Match any selected type'}
          </p>
          <div className={styles.productTypeList}>
            {categories.map((category) => (
              <label className={styles.productType} key={category.slug}>
                <input
                  checked={draftCategories.includes(category.slug)}
                  name="product-type"
                  onChange={() => toggleCategory(category.slug)}
                  type={categorySelection === 'single' ? 'radio' : 'checkbox'}
                  value={category.slug}
                />
                <span>{category.name}</span>
                {category.count === undefined ? null : (
                  <span className={styles.facetCount}>{category.count}</span>
                )}
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.drawerActions}>
          <Button onClick={applyFilters} pending={isPending}>
            Apply filters
          </Button>
          <button
            className={styles.resetFilters}
            onClick={() => {
              setDraftCategories([]);
            }}
            type="button"
          >
            Reset
          </button>
        </div>
      </dialog>
    </section>
  );
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\p{White_Space}+/gu, ' ');
}

function isSearchReady(value: string): boolean {
  if (value.length === 0) return true;
  const tokens = value.split(' ');
  return (
    Array.from(value).length >= 2 &&
    Array.from(value).length <= 80 &&
    tokens.length <= 8 &&
    tokens.every((token) => Array.from(token).length <= 32) &&
    !/[\p{C}\\%_]/u.test(value)
  );
}
