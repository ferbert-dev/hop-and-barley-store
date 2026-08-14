import { describe, expect, it } from 'vitest';
import { formatPrice } from './format-price';

describe('formatPrice', () => {
  it.each([
    [499, 'EUR', '€4.99'],
    [1250, 'GBP', '£12.50'],
  ])('formats %i minor units in %s', (minor, currency, expected) => {
    expect(formatPrice(minor, currency)).toBe(expected);
  });
});
