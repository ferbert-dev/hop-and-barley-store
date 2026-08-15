import type { CatalogQuery } from './catalog-query';
import { buildCatalogHref } from './catalog-query';
import styles from './catalog.module.css';

export function CatalogPagination({
  query,
  totalPages,
}: {
  query: CatalogQuery;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;
  const pages = getVisiblePages(query.page, totalPages);

  return (
    <nav aria-label="Catalog pages" className={styles.pagination}>
      {query.page > 1 ? (
        <a href={buildCatalogHref(query, { page: query.page - 1 })}>Previous</a>
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
                <a href={buildCatalogHref(query, { page })}>{page}</a>
              )}
            </li>
          ),
        )}
      </ol>
      {query.page < totalPages ? (
        <a href={buildCatalogHref(query, { page: query.page + 1 })}>Next</a>
      ) : (
        <span aria-disabled="true">Next</span>
      )}
    </nav>
  );
}

export function getVisiblePages(
  current: number,
  total: number,
): Array<number | null> {
  const candidates = new Set([1, total, current - 1, current, current + 1]);
  const pages = [...candidates]
    .filter((page) => page >= 1 && page <= total)
    .sort((left, right) => left - right);
  const result: Array<number | null> = [];
  for (const page of pages) {
    const previous = result.at(-1);
    if (typeof previous === 'number' && page - previous > 1) result.push(null);
    result.push(page);
  }
  return result;
}
