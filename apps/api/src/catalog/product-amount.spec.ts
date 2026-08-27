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
    orderStepAmount: 100_000,
    saleKind: 'WEIGHT',
  } as const;

  it.each([100_000, 200_000, 2_000_000, 10_000_000, 100_000_000])(
    'accepts the required %i mg weight vector',
    (amount) => expect(isValidOrderAmount(amount, weightRules)).toBe(true),
  );

  it.each([99_999, 100_001, 155_000, 100_100_000, MAX_COMMERCE_AMOUNT + 1])(
    'rejects below-minimum, off-step, or unsafe amount %i',
    (amount) => expect(isValidOrderAmount(amount, weightRules)).toBe(false),
  );

  it('applies a lower explicit maximum to one weight product only', () => {
    expect(
      isValidOrderAmount(20_000_000, {
        ...weightRules,
        maximumOrderAmount: 20_000_000,
      }),
    ).toBe(true);
    expect(
      isValidOrderAmount(20_100_000, {
        ...weightRules,
        maximumOrderAmount: 20_000_000,
      }),
    ).toBe(false);
  });

  it('retains the integer lattice and technical bound for package and kit products', () => {
    expect(
      isValidOrderAmount(2_000_000_000, {
        maximumOrderAmount: null,
        minimumOrderAmount: 1,
        orderStepAmount: 1,
        saleKind: 'PACKAGE',
      }),
    ).toBe(true);
    expect(
      isValidOrderAmount(12, {
        maximumOrderAmount: 12,
        minimumOrderAmount: 2,
        orderStepAmount: 2,
        saleKind: 'KIT',
      }),
    ).toBe(true);
  });

  it('rounds proportional prices once using exact integer arithmetic', () => {
    expect(calculateLineTotalMinor(599, 100_000, 100_000)).toBe(599);
    expect(calculateLineTotalMinor(599, 200_000, 100_000)).toBe(1_198);
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
