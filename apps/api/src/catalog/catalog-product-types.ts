export const CATALOG_INGREDIENT_PRODUCT_TYPES = [
  {
    displayOrder: 1,
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Hops',
    slug: 'hops',
  },
  {
    displayOrder: 2,
    id: '10000000-0000-4000-8000-000000000002',
    name: 'Malt',
    slug: 'malts',
  },
  {
    displayOrder: 3,
    id: '10000000-0000-4000-8000-000000000003',
    name: 'Yeast',
    slug: 'yeast',
  },
  {
    displayOrder: 4,
    id: '10000000-0000-4000-8000-000000000004',
    name: 'Adjuncts',
    slug: 'adjuncts',
  },
] as const;

export type CatalogIngredientProductTypeSlug =
  (typeof CATALOG_INGREDIENT_PRODUCT_TYPES)[number]['slug'];

export const CATALOG_INGREDIENT_PRODUCT_TYPE_SLUGS =
  CATALOG_INGREDIENT_PRODUCT_TYPES.map(({ slug }) => slug);

export const CATALOG_ADMIN_PRODUCT_TYPES = [
  ...CATALOG_INGREDIENT_PRODUCT_TYPES,
  {
    displayOrder: 5,
    id: '10000000-0000-4000-8000-000000000005',
    name: 'Kits',
    slug: 'kits',
  },
] as const;
