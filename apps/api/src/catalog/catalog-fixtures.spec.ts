import {
  catalogCategories,
  catalogProducts,
} from '../../prisma/catalog-fixtures';

const expectedCategories = ['adjuncts', 'hops', 'kits', 'malts', 'yeast'];

const expectedProducts = {
  'caramel-malt': [300, '/assets/products/caramel-malt.webp'],
  'cascade-hops': [749, '/assets/products/cascade-hops.webp'],
  'centennial-hops': [620, '/assets/products/centennial-hops.webp'],
  'citra-hops': [599, '/assets/products/citra-hops.webp'],
  'imperial-yeast': [899, '/assets/products/imperial-yeast.webp'],
  'maris-otter-malt': [250, '/assets/products/maris-otter-malt.webp'],
  'mosaic-hops': [950, '/assets/products/mosaic-hops.webp'],
  'pilsner-malt': [220, '/assets/products/pilsner-malt.webp'],
  'saaz-hops': [475, '/assets/products/saaz-hops.webp'],
  'safale-us05-yeast': [325, '/assets/products/safale-us05-yeast.webp'],
  'unmalted-wheat': [180, '/assets/products/unmalted-wheat.webp'],
  'west-coast-ipa-kit': [6000, '/assets/products/west-coast-ipa-kit.webp'],
} as const;

describe('C1 catalog fixtures', () => {
  it('defines the five normalized categories with stable identities', () => {
    expect(catalogCategories.map(({ slug }) => slug).sort()).toEqual(
      expectedCategories,
    );
    expect(new Set(catalogCategories.map(({ id }) => id)).size).toBe(5);
    expect(catalogCategories.every(({ id }) => isUuid(id))).toBe(true);
  });

  it('defines exactly the twelve USD products using the accepted D1 paths', () => {
    expect(catalogProducts).toHaveLength(12);
    expect(new Set(catalogProducts.map(({ id }) => id)).size).toBe(12);
    expect(new Set(catalogProducts.map(({ slug }) => slug)).size).toBe(12);

    for (const product of catalogProducts) {
      expect(isUuid(product.id)).toBe(true);
      expect(product.currency).toBe('USD');
      expect(product.stockQuantity).toBe(100);
      expect(product.isActive).toBe(true);
      expect(product.description.split('\n\n')).toHaveLength(3);
      expect(product.teaser.trim()).not.toBe('');
      expect(product.priceQualifier.trim()).not.toBe('');
      expect(product.specifications.length).toBeGreaterThan(0);
      expect(expectedProducts[product.slug]).toEqual([
        product.priceMinor,
        product.imagePath,
      ]);
    }
  });

  it('preserves ordered heterogeneous specifications for the brewing kit', () => {
    const kit = catalogProducts.find(
      ({ slug }) => slug === 'west-coast-ipa-kit',
    );

    expect(kit?.specifications.map(({ label }) => label)).toEqual([
      'Kit Type',
      'Batch Size',
      'Estimated OG',
      'Estimated FG',
      'Estimated ABV',
      'IBU',
      'Included Ingredients',
    ]);
    expect(kit?.specifications.at(-1)).toEqual({
      label: 'Included Ingredients',
      value: [
        '12 lbs Maris Otter Pale Malt',
        '1 lb Caramel Malt 40L',
        '0.5 lb Dextrin Malt',
        '1 oz Columbus Hops (60 min)',
        '1 oz Simcoe Hops (15 min)',
        '1 oz Centennial Hops (5 min)',
        '2 oz Centennial Hops (Dry Hop)',
        '1 pack SafAle US-05 Dry Ale Yeast',
        'Whirlfloc Tablet, Priming Sugar, Step-by-step Instructions',
      ],
    });
  });
});

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}
