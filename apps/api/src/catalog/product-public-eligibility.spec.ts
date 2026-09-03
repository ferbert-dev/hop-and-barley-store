import { isPublicProductEligible } from './product-public-eligibility';

const evaluatedAt = new Date('2026-09-03T12:00:00.000Z');

describe('isPublicProductEligible', () => {
  it.each([
    ['active without bounds', true, null, null, true],
    ['starts exactly now', true, evaluatedAt, null, true],
    [
      'scheduled after now',
      true,
      new Date('2026-09-03T12:00:00.001Z'),
      null,
      false,
    ],
    ['expires exactly now', true, null, evaluatedAt, false],
    [
      'expires after now',
      true,
      null,
      new Date('2026-09-03T12:00:00.001Z'),
      true,
    ],
    ['disabled', false, null, null, false],
  ] as const)('%s', (_label, isActive, activeFrom, activeUntil, expected) => {
    expect(
      isPublicProductEligible(
        { activeFrom, activeUntil, isActive },
        evaluatedAt,
      ),
    ).toBe(expected);
  });
});
