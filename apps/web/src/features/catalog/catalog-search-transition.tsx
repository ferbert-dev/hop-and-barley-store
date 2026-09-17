'use client';

import { CircleNotch } from '@phosphor-icons/react/dist/ssr';
import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { CatalogProductGridSkeleton } from './catalog-skeleton';
import styles from './catalog.module.css';

interface CatalogSearchTransitionValue {
  beginSearch: (target: string) => void;
  isSearchPending: boolean;
}

const CatalogSearchTransitionContext =
  createContext<CatalogSearchTransitionValue | null>(null);

export function CatalogSearchTransitionProvider({
  activeSearch,
  children,
}: {
  activeSearch: string;
  children: ReactNode;
}) {
  const [pendingTarget, setPendingTarget] = useState<string | null>(null);
  const value = useMemo(
    () => ({
      beginSearch: setPendingTarget,
      isSearchPending: pendingTarget !== null && pendingTarget !== activeSearch,
    }),
    [activeSearch, pendingTarget],
  );

  return (
    <CatalogSearchTransitionContext.Provider value={value}>
      {children}
    </CatalogSearchTransitionContext.Provider>
  );
}

export function CatalogSearchResults({ children }: { children: ReactNode }) {
  const { isSearchPending } = useCatalogSearchTransition();

  return (
    <div className={styles.results}>
      {isSearchPending ? (
        <div
          aria-label="Searching products"
          aria-live="polite"
          className={styles.searchResultsProgress}
          role="status"
        >
          <span className={styles.searchResultsSpinnerFrame}>
            <CircleNotch
              aria-hidden="true"
              className={styles.searchResultsSpinner}
              size={30}
              weight="bold"
            />
          </span>
        </div>
      ) : null}
      <div aria-busy={isSearchPending}>
        {isSearchPending ? <CatalogSearchSkeleton /> : children}
      </div>
    </div>
  );
}

export function useCatalogSearchTransition() {
  const value = useContext(CatalogSearchTransitionContext);
  if (value === null) {
    throw new Error(
      'Catalog search transition must be used inside its provider.',
    );
  }
  return value;
}

function CatalogSearchSkeleton() {
  return (
    <div className={styles.searchResultsLoading}>
      <CatalogProductGridSkeleton />
    </div>
  );
}
