import {
  buildCatalogFacetQuery,
  buildCatalogProductWhere,
} from './catalog-list-query';

describe('catalog Product Type facets', () => {
  it.each(['public', 'admin'] as const)(
    'discovers %s selectors from categories with matching products',
    (visibility) => {
      expect(buildCatalogFacetQuery(visibility)).toMatchObject({
        where: {
          products: { some: { currency: 'USD' } },
        },
      });
      expect(buildCatalogFacetQuery(visibility).where).not.toHaveProperty(
        'slug',
      );
    },
  );
});

describe('public product activity windows', () => {
  const evaluatedAt = new Date('2026-08-28T17:00:00.000Z');

  it('requires manual activation and a currently open activity window', () => {
    expect(
      buildCatalogProductWhere(
        { limit: 12, page: 1, sort: 'name-asc' },
        'public',
        evaluatedAt,
      ),
    ).toEqual({
      AND: [
        {
          OR: [{ activeFrom: null }, { activeFrom: { lte: evaluatedAt } }],
        },
        {
          OR: [{ activeUntil: null }, { activeUntil: { gt: evaluatedAt } }],
        },
      ],
      currency: 'USD',
      isActive: true,
    });
  });

  it('keeps admin queries independent of the public activity window', () => {
    expect(
      buildCatalogProductWhere(
        { limit: 12, page: 1, sort: 'name-asc' },
        'admin',
        evaluatedAt,
      ),
    ).toEqual({ currency: 'USD' });
  });
});
