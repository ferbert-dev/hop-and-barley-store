import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migrationPath = resolve(
  __dirname,
  '../../prisma/migrations/20260814153000_expand_catalog/migration.sql',
);

describe('C1 catalog migration contract', () => {
  const sql = readFileSync(migrationPath, 'utf8');

  it.each([
    'Category_displayOrder_nonnegative_check',
    'Category_slug_format_check',
    'Product_slug_format_check',
    'Product_priceMinor_nonnegative_check',
    'Product_stockQuantity_nonnegative_check',
    'Product_currency_iso_check',
    'Product_imagePath_local_check',
    'Product_specifications_array_check',
    'Product_active_content_check',
    'Product_categoryId_fkey',
  ])('declares the named %s constraint', (constraint) => {
    expect(sql).toContain(`CONSTRAINT "${constraint}"`);
  });

  it('fails forward rather than guessing fields for unknown legacy products', () => {
    for (const slug of [
      'house-lager',
      'citrus-pale-ale',
      'caramel-malt',
      'cascade-hops',
      'centennial-hops',
      'citra-hops',
      'imperial-yeast',
      'maris-otter-malt',
      'mosaic-hops',
      'pilsner-malt',
      'saaz-hops',
      'safale-us05-yeast',
      'unmalted-wheat',
      'west-coast-ipa-kit',
    ]) {
      expect(sql).toContain(`'${slug}'`);
    }
    expect(sql).toContain('Unexpected pre-C1 Product rows');
  });

  it('keeps known legacy fixtures inactive until the seed replaces them', () => {
    expect(sql).toContain('legacy-foundation');
    expect(sql).toMatch(/"isActive"\s*=\s*false/i);
  });

  it('creates the public catalog filter and price index', () => {
    expect(sql).toContain('"Product_isActive_priceMinor_idx"');
  });
});
