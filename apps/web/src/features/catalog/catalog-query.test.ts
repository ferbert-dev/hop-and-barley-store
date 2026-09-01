import { describe, expect, it } from 'vitest';

import {
  buildCatalogHref,
  DEFAULT_CATALOG_QUERY,
  parseCatalogSearchParams,
} from './catalog-query';

describe('catalog URL query contract', () => {
  it('applies API defaults and emits the canonical root URL', () => {
    expect(parseCatalogSearchParams({})).toEqual({
      canonicalHref: '/',
      isCanonical: true,
      kind: 'valid',
      query: DEFAULT_CATALOG_QUERY,
    });
  });

  it('normalizes Unicode search and serializes keys in one stable order', () => {
    expect(
      parseCatalogSearchParams({
        category: 'hops',
        limit: '24',
        maxPriceMinor: '900',
        minPriceMinor: '400',
        page: '2',
        search: '  Cafe\u0301   hops  ',
        sort: 'price-desc',
      }),
    ).toEqual({
      canonicalHref:
        '/?search=Caf%C3%A9+hops&category=hops&minPriceMinor=400&maxPriceMinor=900&sort=price-desc&page=2&limit=24',
      isCanonical: false,
      kind: 'valid',
      query: {
        category: ['hops'],
        limit: 24,
        maxPriceMinor: 900,
        minPriceMinor: 400,
        page: 2,
        search: 'Café hops',
        sort: 'price-desc',
      },
    });
  });

  it('omits blank search and explicit defaults from canonical URLs', () => {
    expect(
      parseCatalogSearchParams({
        limit: '12',
        page: '1',
        search: '  ',
        sort: 'name-asc',
      }),
    ).toMatchObject({ canonicalHref: '/', isCanonical: false, kind: 'valid' });
  });

  it('canonicalizes blank native-form controls away before calling the API', () => {
    expect(
      parseCatalogSearchParams({
        category: '',
        maxPriceMinor: '',
        minPriceMinor: '',
      }),
    ).toMatchObject({ canonicalHref: '/', isCanonical: false, kind: 'valid' });
  });

  it.each([
    ['repeated scalar', { search: ['hops', 'malt'] }],
    ['unknown key', { rating: '5' }],
    ['list syntax', { 'page[]': '1' }],
    ['one-character search', { search: 'a' }],
    ['search wildcard', { search: 'hop%' }],
    ['search underscore', { search: 'hop_malt' }],
    ['search backslash', { search: 'hop\\malt' }],
    ['search control', { search: 'hop\u0000malt' }],
    ['uppercase category', { category: 'Hops' }],
    ['invalid category', { category: 'two--hops' }],
    ['leading-zero integer', { page: '01' }],
    ['signed integer', { minPriceMinor: '+1' }],
    ['decimal integer', { limit: '12.0' }],
    ['unsupported sort', { sort: 'created-desc' }],
    ['unsupported Figma New sort', { sort: 'new' }],
    ['unsupported Figma Rating sort', { sort: 'rating' }],
    ['page overflow', { page: '201' }],
    ['limit overflow', { limit: '49' }],
    ['inverted price range', { minPriceMinor: '500', maxPriceMinor: '499' }],
  ] as const)('rejects %s before an API call', (_label, raw) => {
    expect(parseCatalogSearchParams(raw)).toMatchObject({ kind: 'invalid' });
  });

  it('keeps fullwidth percent and underscore as literal NFC text', () => {
    expect(parseCatalogSearchParams({ search: 'ab％cd＿ef' })).toMatchObject({
      canonicalHref: '/?search=ab%EF%BC%85cd%EF%BC%BFef',
      kind: 'valid',
      query: { search: 'ab％cd＿ef' },
    });
  });

  it('builds filter and paging links without carrying a stale page', () => {
    const current = {
      category: ['hops'],
      limit: 24,
      page: 7,
      search: 'citrus hops',
      sort: 'price-desc' as const,
    };

    expect(buildCatalogHref(current, { category: ['malts'] }, true)).toBe(
      '/?search=citrus+hops&category=malts&sort=price-desc&limit=24',
    );
    expect(buildCatalogHref(current, { page: 8 })).toBe(
      '/?search=citrus+hops&category=hops&sort=price-desc&page=8&limit=24',
    );
  });

  it('canonicalizes repeated product types in a stable order', () => {
    expect(
      parseCatalogSearchParams({ category: ['malts', 'hops'] }),
    ).toMatchObject({
      canonicalHref: '/?category=hops&category=malts',
      isCanonical: false,
      kind: 'valid',
      query: { category: ['hops', 'malts'] },
    });
  });
});
