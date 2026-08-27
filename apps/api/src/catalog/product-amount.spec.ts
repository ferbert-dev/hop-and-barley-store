import {
  addMoneyMinor,
  calculateLineTotalMinor,
  isValidOrderAmount,
  MAX_COMMERCE_AMOUNT,
} from './product-amount';

describe('measured product amounts', () => {
  const weightRules = {
    maximumOrderAmount: null,
    minimumOrderAmount: 100_000,
    orderStepAmount: 5_000,
  } as const;

  it.each([100_000, 155_000, 2_000_000, 10_000_000, 100_000_000])(
    'accepts the required %i mg weight vector',
    (amount) => expect(isValidOrderAmount(amount, weightRules)).toBe(true),
  );

  it.each([99_999, 100_001, 152_500, MAX_COMMERCE_AMOUNT + 1])(
    'rejects below-minimum, off-step, or unsafe amount %i',
    (amount) => expect(isValidOrderAmount(amount, weightRules)).toBe(false),
  );

  it('rounds proportional prices once using exact integer arithmetic', () => {
    expect(calculateLineTotalMinor(599, 100_000, 100_000)).toBe(599);
    expect(calculateLineTotalMinor(599, 155_000, 100_000)).toBe(928);
    expect(calculateLineTotalMinor(55, 453_592, 100_000)).toBe(249);
    expect(calculateLineTotalMinor(1, 150_000, 100_000)).toBe(2);
  });

  it('rejects line and aggregate totals outside PostgreSQL int32 money', () => {
    expect(() =>
      calculateLineTotalMinor(2_147_483_647, 2_000_000_000, 1),
    ).toThrow(RangeError);
    expect(() => addMoneyMinor(2_147_483_647, 1)).toThrow(RangeError);
  });
});
