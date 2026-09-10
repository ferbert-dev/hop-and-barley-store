import { addMoneyMinor, MAX_MONEY_MINOR } from '../catalog/product-amount';

export const CHECKOUT_SHIPPING_MINOR = 500;
export const FIRST_PURCHASE_DISCOUNT_BASIS_POINTS = 600;
export const NO_DISCOUNT_POLICY_VERSION = 'no-discount-v1';
export const FIRST_PURCHASE_DISCOUNT_POLICY_VERSION =
  'registered-first-purchase-v1';

export type CheckoutPricing = Readonly<{
  currency: 'EUR';
  discountBasisPoints: number;
  discountMinor: number;
  discountPolicyVersion:
    | typeof FIRST_PURCHASE_DISCOUNT_POLICY_VERSION
    | typeof NO_DISCOUNT_POLICY_VERSION;
  itemSubtotalMinor: number;
  shippingMinor: number;
  totalMinor: number;
}>;

/**
 * Canonical checkout pricing. The discount rounds once at subtotal level,
 * half-up, and never applies to shipping.
 */
export function calculateCheckoutPricing(
  itemSubtotalMinor: number,
  applyFirstPurchaseDiscount: boolean,
): CheckoutPricing {
  if (
    !Number.isInteger(itemSubtotalMinor) ||
    itemSubtotalMinor < 0 ||
    itemSubtotalMinor > MAX_MONEY_MINOR
  ) {
    throw new RangeError('Invalid checkout subtotal');
  }

  const discountBasisPoints = applyFirstPurchaseDiscount
    ? FIRST_PURCHASE_DISCOUNT_BASIS_POINTS
    : 0;
  const discountMinor = applyFirstPurchaseDiscount
    ? Number(
        (BigInt(itemSubtotalMinor) *
          BigInt(FIRST_PURCHASE_DISCOUNT_BASIS_POINTS) +
          5_000n) /
          10_000n,
      )
    : 0;
  const discountedItemsMinor = itemSubtotalMinor - discountMinor;
  const totalMinor = addMoneyMinor(
    discountedItemsMinor,
    CHECKOUT_SHIPPING_MINOR,
  );

  return {
    currency: 'EUR',
    discountBasisPoints,
    discountMinor,
    discountPolicyVersion: applyFirstPurchaseDiscount
      ? FIRST_PURCHASE_DISCOUNT_POLICY_VERSION
      : NO_DISCOUNT_POLICY_VERSION,
    itemSubtotalMinor,
    shippingMinor: CHECKOUT_SHIPPING_MINOR,
    totalMinor,
  };
}
