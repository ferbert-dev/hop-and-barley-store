import { describe, expect, it } from 'vitest';

import {
  estimateLineTotalMinor,
  formatAmount,
  formatPackageNetWeight,
  formatSaleUnit,
  parseWeightInput,
  readQuantityMetadata,
  validateOrderAmount,
} from './quantity-model';

const weight = {
  amountUnit: 'MILLIGRAM' as const,
  kitYieldVolumeMl: null,
  maximumOrderAmount: 100_000_000,
  minimumOrderAmount: 100_000,
  orderStepAmount: 100_000,
  packageNetWeightMg: null,
  priceBasisAmount: 100_000,
  saleKind: 'WEIGHT' as const,
  stockAmount: 100_000_000,
};

describe('measured quantity presentation', () => {
  it('parses kilograms and formats the selected weight without floating-point loss', () => {
    const metadata = readQuantityMetadata(weight);
    expect(metadata).toEqual(weight);
    expect(parseWeightInput('0.1')).toBe(100_000);
    expect(parseWeightInput('10')).toBe(10_000_000);
    expect(formatAmount(900_000, weight)).toBe('900g');
    expect(formatAmount(1_200_000, weight)).toBe('1.2kg');
    expect(formatAmount(10_000_000, weight)).toBe('10kg');
    expect(formatSaleUnit(weight)).toBe('per 100g');
  });

  it('enforces the server-provided minimum, 100g increment, maximum and stock without disclosing stock', () => {
    expect(validateOrderAmount(95_000, weight)).toBe(
      'Minimum order amount is 100g.',
    );
    expect(validateOrderAmount(150_000, weight)).toBe(
      'Choose increments of 100g.',
    );
    expect(validateOrderAmount(100_005_000, weight)).toBe(
      'Maximum order amount is 100kg.',
    );
    expect(
      validateOrderAmount(105_000, { ...weight, stockAmount: 100_000 }),
    ).toBe('This amount is no longer available.');
  });

  it('calculates a deterministic, rounded display estimate while leaving the server authoritative', () => {
    expect(estimateLineTotalMinor(599, 900_000, weight)).toBe(5_391);
  });

  it('labels packages only with a net weight when the API provides one', () => {
    const packageMetadata = {
      ...weight,
      amountUnit: 'EACH' as const,
      packageNetWeightMg: 250_000,
      saleKind: 'PACKAGE' as const,
    };
    expect(formatAmount(2, packageMetadata)).toBe('2 packs · 500g total net');
    expect(formatSaleUnit(packageMetadata)).toBe('per pack');
    expect(formatPackageNetWeight(packageMetadata)).toBe('250g net each');
    expect(
      formatPackageNetWeight({ ...packageMetadata, packageNetWeightMg: null }),
    ).toBeNull();
  });

  it('shows aggregate kit output only from the API yield field', () => {
    const kit = {
      ...weight,
      amountUnit: 'EACH' as const,
      kitYieldVolumeMl: 19_000,
      saleKind: 'KIT' as const,
    };
    expect(formatAmount(4, { ...kit, kitYieldVolumeMl: 18_927 })).toBe(
      '4 kits · 20 gal / approx. 76 L total yield',
    );
  });
});
