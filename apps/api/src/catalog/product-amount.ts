export const MAX_COMMERCE_AMOUNT = 2_000_000_000;
export const MAX_MONEY_MINOR = 2_147_483_647;

export type ProductAmountRules = Readonly<{
  maximumOrderAmount: number | null;
  minimumOrderAmount: number;
  orderStepAmount: number;
}>;

export function isValidOrderAmount(
  amount: number,
  rules: ProductAmountRules,
): boolean {
  return (
    Number.isInteger(amount) &&
    amount >= rules.minimumOrderAmount &&
    amount <= MAX_COMMERCE_AMOUNT &&
    (rules.maximumOrderAmount === null || amount <= rules.maximumOrderAmount) &&
    (amount - rules.minimumOrderAmount) % rules.orderStepAmount === 0
  );
}

/**
 * Rounds a positive proportional price to the nearest minor unit, with .5
 * rounding upward. BigInt keeps the multiplication exact before the bounded
 * result is converted back to the JSON-safe integer API contract.
 */
export function calculateLineTotalMinor(
  priceMinor: number,
  amount: number,
  priceBasisAmount: number,
): number {
  if (
    !Number.isInteger(priceMinor) ||
    priceMinor < 0 ||
    !Number.isInteger(amount) ||
    amount < 1 ||
    amount > MAX_COMMERCE_AMOUNT ||
    !Number.isInteger(priceBasisAmount) ||
    priceBasisAmount < 1 ||
    priceBasisAmount > MAX_COMMERCE_AMOUNT
  ) {
    throw new RangeError('Invalid proportional pricing input');
  }

  const numerator = BigInt(priceMinor) * BigInt(amount);
  const basis = BigInt(priceBasisAmount);
  const rounded = (2n * numerator + basis) / (2n * basis);
  if (rounded > BigInt(MAX_MONEY_MINOR)) {
    throw new RangeError('Calculated line total exceeds the money bound');
  }
  return Number(rounded);
}

export function addMoneyMinor(left: number, right: number): number {
  const total = BigInt(left) + BigInt(right);
  if (left < 0 || right < 0 || total > BigInt(MAX_MONEY_MINOR)) {
    throw new RangeError('Calculated total exceeds the money bound');
  }
  return Number(total);
}
