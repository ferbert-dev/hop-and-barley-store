'use client';

import type { CompatibleCatalogCategoryFacet } from '@hop-and-barley/api-client';
import {
  MagnifyingGlass,
  SlidersHorizontal,
  X,
} from '@phosphor-icons/react/dist/ssr';
import { useRouter } from 'next/navigation';
import {
  useEffect,
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
} from 'react';

import { Button } from '../../components/ui/button';
import {
  buildCatalogHref,
  buildCatalogTitle,
  type CatalogQuery,
} from './catalog-query';
import styles from './catalog.module.css';

type CatalogHrefBuilder = (
  current: CatalogQuery,
  overrides?: Partial<CatalogQuery>,
  resetPage?: boolean,
) => string;

const SEARCH_DEBOUNCE_MS = 300;

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
  const catalogTitle = buildCatalogTitle(query);

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
    const normalized = normalizeSearch(search);
    if (normalized === activeSearch) {
      immediateSearchRef.current = null;
      return;
    }
    if (normalized === immediateSearchRef.current) return;
    if (!isSearchReady(normalized)) return;

    const timeout = window.setTimeout(() => {
      searchTimeoutRef.current = null;
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
  }, [activeSearch, buildHref, query, router, search]);

  function openDrawer() {
    setDraftCategories(query.category ?? []);
    setDrawerOpen(true);
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

  function applySort(event: ChangeEvent<HTMLSelectElement>) {
    const sort = event.currentTarget.value as CatalogQuery['sort'];
    cancelPendingSearch();
    const searchOverride = getSearchOverride();
    immediateSearchRef.current = searchOverride ?? '';
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

  return (
    <section aria-label="Catalog discovery controls" className={styles.filters}>
      <form
        aria-label="Search products"
        className={styles.searchForm}
        onSubmit={(event) => event.preventDefault()}
        role="search"
      >
        <MagnifyingGlass aria-hidden="true" size={24} weight="regular" />
        <label className="visually-hidden" htmlFor="catalog-search">
          Search products
        </label>
        <input
          aria-describedby="catalog-search-status"
          autoComplete="off"
          className={styles.searchInput}
          id="catalog-search"
          maxLength={80}
          onChange={(event) => {
            const value = event.currentTarget.value;
            setSearchState((current) => ({
              ...current,
              value,
            }));
          }}
          placeholder="Search products, varieties, or flavors"
          type="search"
          value={search}
        />
        <span
          aria-live="polite"
          className="visually-hidden"
          id="catalog-search-status"
        >
          {isPending ? 'Updating products' : 'Products updated'}
        </span>
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

      <label className={styles.sortControl}>
        <span className="visually-hidden">Sort by</span>
        <select
          aria-label="Sort by"
          className={styles.sortSelect}
          onChange={applySort}
          value={query.sort}
        >
          <option value="name-asc">Sort: Name A–Z</option>
          <option value="name-desc">Sort: Name Z–A</option>
          <option value="price-asc">Sort: Price low to high</option>
          <option value="price-desc">Sort: Price high to low</option>
        </select>
      </label>

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
