import {
  calculateCheckoutPricing,
  CHECKOUT_SHIPPING_MINOR,
  FIRST_PURCHASE_DISCOUNT_BASIS_POINTS,
  FIRST_PURCHASE_DISCOUNT_POLICY_VERSION,
  NO_DISCOUNT_POLICY_VERSION,
} from './checkout-pricing';

describe('canonical checkout pricing', () => {
  it.each([
    [0, 0, 500],
    [1, 0, 501],
    [8, 0, 508],
    [9, 1, 508],
    [25, 2, 523],
    [75, 5, 570],
    [100, 6, 594],
    [99, 6, 593],
    [10_000, 600, 9_900],
  ])(
    'rounds a %i-cent eligible subtotal to %i cents discount',
    (subtotal, discount, total) => {
      expect(calculateCheckoutPricing(subtotal, true)).toEqual({
        currency: 'EUR',
        discountBasisPoints: FIRST_PURCHASE_DISCOUNT_BASIS_POINTS,
        discountMinor: discount,
        discountPolicyVersion: FIRST_PURCHASE_DISCOUNT_POLICY_VERSION,
        itemSubtotalMinor: subtotal,
        shippingMinor: CHECKOUT_SHIPPING_MINOR,
        totalMinor: total,
      });
    },
  );

  it('keeps guest and returning-customer pricing undiscounted', () => {
    expect(calculateCheckoutPricing(10_000, false)).toEqual({
      currency: 'EUR',
      discountBasisPoints: 0,
      discountMinor: 0,
      discountPolicyVersion: NO_DISCOUNT_POLICY_VERSION,
      itemSubtotalMinor: 10_000,
      shippingMinor: CHECKOUT_SHIPPING_MINOR,
      totalMinor: 10_500,
    });
  });

  it.each([-1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER])(
    'rejects an unsafe subtotal %p',
    (subtotal) => {
      expect(() => calculateCheckoutPricing(subtotal, true)).toThrow(
        RangeError,
      );
    },
  );

  it('rejects a total that exceeds the storage boundary', () => {
    expect(() => calculateCheckoutPricing(2_147_483_647, false)).toThrow(
      RangeError,
    );
  });
});
