export const MAX_COMMERCE_AMOUNT = 2_000_000_000;
export const MAX_MONEY_MINOR = 2_147_483_647;
export const MAX_WEIGHT_AMOUNT_MG = 100_000_000;
export const WEIGHT_ORDER_STEP_MG = 100_000;

export type ProductAmountRules = Readonly<{
  maximumOrderAmount: number | null;
  minimumOrderAmount: number;
  orderStepAmount: number;
  saleKind: 'KIT' | 'PACKAGE' | 'WEIGHT';
}>;

export function isValidOrderAmount(
  amount: number,
  rules: ProductAmountRules,
): boolean {
  const maximum =
    rules.saleKind === 'WEIGHT'
      ? Math.min(
          rules.maximumOrderAmount ?? MAX_WEIGHT_AMOUNT_MG,
          MAX_WEIGHT_AMOUNT_MG,
        )
      : (rules.maximumOrderAmount ?? MAX_COMMERCE_AMOUNT);
  return (
    Number.isInteger(amount) &&
    amount >= rules.minimumOrderAmount &&
    amount <= maximum &&
    (rules.saleKind !== 'WEIGHT' ||
      (rules.minimumOrderAmount === WEIGHT_ORDER_STEP_MG &&
        rules.orderStepAmount === WEIGHT_ORDER_STEP_MG)) &&
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
