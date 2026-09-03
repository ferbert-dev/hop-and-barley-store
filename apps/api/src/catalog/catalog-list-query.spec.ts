import {
  buildCatalogFacetQuery,
  buildCatalogProductWhere,
} from './catalog-list-query';

describe('catalog Product Type facets', () => {
  it('discovers public selectors from categories with matching products', () => {
    expect(buildCatalogFacetQuery('public')).toMatchObject({
      where: {
        products: { some: { currency: 'USD' } },
      },
    });
    expect(buildCatalogFacetQuery('public').where).not.toHaveProperty('slug');
  });

  it('includes every product type supported by the admin editor', () => {
    expect(buildCatalogFacetQuery('admin')).toMatchObject({
      where: {
        products: { some: { currency: 'USD' } },
        slug: { in: ['hops', 'malts', 'yeast', 'adjuncts', 'kits'] },
      },
    });
  });

  it('scopes counts to price and search constraints while ignoring category', () => {
    const evaluatedAt = new Date('2026-08-28T17:00:00.000Z');
    const query = buildCatalogFacetQuery('admin', evaluatedAt, {
      category: 'hops',
      limit: 12,
      minPriceMinor: 500,
      page: 1,
      search: 'Citra',
      sort: 'name-asc',
    });

    expect(query.select._count.select.products.where).toMatchObject({
      currency: 'USD',
      priceMinor: { gte: 500 },
    });
    expect(query.select._count.select.products.where).not.toHaveProperty(
      'category',
    );
    expect(query.select._count.select.products.where).toHaveProperty('AND');
  });
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
