import { describe, expect, it } from 'vitest';

import {
  buildAdminProductsHref,
  parseAdminProductsSearchParams,
} from './admin-products-query';

describe('admin products URL state', () => {
  it('uses the existing catalog query grammar under the protected route', () => {
    expect(
      parseAdminProductsSearchParams({
        search: 'Citra hops',
        category: 'hops',
        minPriceMinor: '100',
        maxPriceMinor: '9999',
        sort: 'price-desc',
        page: '2',
        limit: '24',
      }),
    ).toEqual({
      canonicalHref:
        '/admin/products?search=Citra+hops&category=hops&minPriceMinor=100&maxPriceMinor=9999&sort=price-desc&page=2&limit=24',
      isCanonical: true,
      kind: 'valid',
      query: {
        category: 'hops',
        limit: 24,
        maxPriceMinor: 9999,
        minPriceMinor: 100,
        page: 2,
        search: 'Citra hops',
        sort: 'price-desc',
      },
    });
  });

  it('redirects a normalizable URL without changing its admin route', () => {
    expect(
      parseAdminProductsSearchParams({ search: '  Citra   hops ' }),
    ).toMatchObject({
      canonicalHref: '/admin/products?search=Citra+hops',
      isCanonical: false,
      kind: 'valid',
    });
  });

  it('fails closed for duplicated, unsupported, and invalid catalog keys', () => {
    expect(parseAdminProductsSearchParams({ page: ['1', '2'] })).toMatchObject({
      kind: 'invalid',
    });
    expect(
      parseAdminProductsSearchParams({ lifecycleStatus: 'ACTIVE' }),
    ).toMatchObject({ kind: 'invalid' });
    expect(
      parseAdminProductsSearchParams({
        minPriceMinor: '9',
        maxPriceMinor: '1',
      }),
    ).toMatchObject({ kind: 'invalid' });
  });

  it('preserves filters while changing pages and resets a changed filter to page one', () => {
    const query = {
      category: 'hops',
      limit: 12,
      page: 3,
      search: 'Citra',
      sort: 'name-asc' as const,
    };

    expect(buildAdminProductsHref(query, { page: 2 })).toBe(
      '/admin/products?search=Citra&category=hops&page=2',
    );
    expect(buildAdminProductsHref(query, { search: 'Cascade' }, true)).toBe(
      '/admin/products?search=Cascade&category=hops',
    );
  });
});
