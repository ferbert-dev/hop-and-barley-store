import { describe, expect, it } from 'vitest';

import {
  initialLocalDateTime,
  validateAdminProductCreate,
} from './admin-product-create-validation';

const image = new File(['image'], 'hop.webp', { type: 'image/webp' });
const input = {
  activeFrom: '2026-08-28T10:30',
  activeUntil: '',
  categoryId: '10000000-0000-4000-8000-000000000001',
  description: 'Bright citrus hops for aromatic beer.',
  image,
  isActive: true,
  name: 'Fresh Hops',
  packageNetWeightGrams: '',
  price: '5.9',
  saleKind: 'WEIGHT' as const,
  stock: '1.2',
};

describe('admin product creation validation', () => {
  it('converts weight stock exactly to canonical milligrams and normalizes USD', () => {
    const result = validateAdminProductCreate(input);

    expect(result).toMatchObject({
      ok: true,
      value: {
        categoryId: input.categoryId,
        price: '5.90',
        saleKind: 'WEIGHT',
        stockAmount: 1_200_000,
      },
    });
  });

  it('uses integer package stock and converts optional package grams to mg', () => {
    const result = validateAdminProductCreate({
      ...input,
      packageNetWeightGrams: '11.25',
      saleKind: 'PACKAGE',
      stock: '24',
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        packageNetWeightMg: 11_250,
        saleKind: 'PACKAGE',
        stockAmount: 24,
      },
    });
  });

  it.each([
    [
      'bad image',
      { image: new File(['x'], 'hop.gif', { type: 'image/gif' }) },
      'image',
    ],
    ['wrong weight step', { stock: '1.25' }, 'stock'],
    ['zero price', { price: '0' }, 'price'],
    ['price above the API bound', { price: '21474836.48' }, 'price'],
    ['unsafe numeric price', { price: '999999999999999999999.99' }, 'price'],
    ['end before start', { activeUntil: '2026-08-28T10:00' }, 'activeUntil'],
  ])('reports %s without sending a mutation', (_label, override, errorKey) => {
    const result = validateAdminProductCreate({ ...input, ...override });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[errorKey]).toBeTruthy();
  });

  it('renders a local datetime value without seconds for the date-time input', () => {
    expect(initialLocalDateTime(new Date('2026-08-28T10:30:59.000Z'))).toMatch(
      /^2026-08-28T\d{2}:\d{2}$/u,
    );
  });
});
