import { describe, expect, it, vi } from 'vitest';
import { formatPrice } from './format-price';

describe('formatPrice', () => {
  it.each([
    [499, 'EUR', '€4.99'],
    [1250, 'GBP', '£12.50'],
  ])('formats %i minor units in %s', (minor, currency, expected) => {
    expect(formatPrice({ minorUnits: minor, currency })).toBe(expected);
  });

  it('keeps the existing two-argument call compatible', () => {
    expect(formatPrice(499, 'EUR')).toBe('€4.99');
  });

  it('uses the currency fraction digits instead of assuming cents', () => {
    expect(
      formatPrice({ minorUnits: 500, currency: 'JPY', locale: 'ja-JP' }),
    ).toBe('￥500');
  });

  it.each([
    [{ minorUnits: 12_345, currency: 'KWD', locale: 'en-GB' }, 'KWD 12.345'],
    [{ minorUnits: 12_345, currency: 'CLF', locale: 'en-GB' }, 'CLF 1.2345'],
  ])('formats multi-decimal currencies exactly: %o', (value, expected) => {
    expect(formatPrice(value)).toBe(expected);
  });

  it.each([
    [Number.MAX_SAFE_INTEGER, '€90,071,992,547,409.91'],
    [Number.MIN_SAFE_INTEGER, '-€90,071,992,547,409.91'],
  ])('preserves the full safe-integer range: %s', (minorUnits, expected) => {
    expect(formatPrice(minorUnits, 'EUR')).toBe(expected);
  });

  it.each([
    ['JPY', 'JP¥9,007,199,254,740,991'],
    ['KWD', 'KWD 9,007,199,254,740.991'],
    ['CLF', 'CLF 900,719,925,474.0991'],
  ])('preserves maximum safe minor units for %s', (currency, expected) => {
    expect(formatPrice(Number.MAX_SAFE_INTEGER, currency)).toBe(expected);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects non-integer minor units: %s',
    (minorUnits) => {
      expect(() => formatPrice({ minorUnits, currency: 'EUR' })).toThrow(
        RangeError,
      );
    },
  );

  it('rejects a non-canonical currency code', () => {
    expect(() => formatPrice({ minorUnits: 499, currency: 'eur' })).toThrow(
      RangeError,
    );
  });

  it('fails closed when the runtime loses decimal-string precision', async () => {
    const formatToParts = vi
      .spyOn(Intl.NumberFormat.prototype, 'formatToParts')
      .mockReturnValue([
        { type: 'integer', value: '90071992547410' },
        { type: 'decimal', value: '.' },
        { type: 'fraction', value: '00' },
      ]);

    try {
      vi.resetModules();
      const { formatPrice: unsupportedFormatPrice } =
        await import('./format-price');

      expect(() => unsupportedFormatPrice(499, 'EUR')).toThrow(
        'This runtime cannot format exact decimal strings safely.',
      );
    } finally {
      formatToParts.mockRestore();
      vi.resetModules();
    }
  });
});
