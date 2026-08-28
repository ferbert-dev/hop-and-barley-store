import { buildCatalogFacetQuery } from './catalog-list-query';

describe('catalog ingredient Product Type facets', () => {
  it.each(['public', 'admin'] as const)(
    'limits %s selectors to the four approved ingredient types',
    (visibility) => {
      expect(buildCatalogFacetQuery(visibility)).toMatchObject({
        where: {
          slug: { in: ['hops', 'malts', 'yeast', 'adjuncts'] },
        },
      });
    },
  );
});
