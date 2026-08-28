import { describe, expect, it } from 'vitest';

import {
  formatActivationWindow,
  formatAdminStock,
  formatUtc,
  getLifecyclePresentation,
} from './admin-product-format';

describe('administrator product formatting', () => {
  it('formats canonical stock amounts without presenting a generic unit', () => {
    expect(formatAdminStock(900_000, 'WEIGHT', 'MILLIGRAM')).toBe('900 g');
    expect(formatAdminStock(1_250_000, 'WEIGHT', 'MILLIGRAM')).toBe('1.25 kg');
    expect(formatAdminStock(1, 'PACKAGE', 'EACH')).toBe('1 pack');
    expect(formatAdminStock(2, 'PACKAGE', 'EACH')).toBe('2 packs');
    expect(formatAdminStock(4, 'KIT', 'EACH')).toBe('4 kits');
  });

  it('formats nullable activation windows as explicit UTC instants', () => {
    expect(formatUtc('2026-08-28T10:00:00.000Z')).toBe(
      '28 Aug 2026, 10:00 UTC',
    );
    expect(formatActivationWindow(null, null)).toBe('No activation window');
    expect(formatActivationWindow('2026-08-28T10:00:00.000Z', null)).toBe(
      'Starts 28 Aug 2026, 10:00 UTC',
    );
    expect(formatActivationWindow(null, '2026-08-29T10:00:00.000Z')).toBe(
      'Ends 29 Aug 2026, 10:00 UTC',
    );
  });

  it.each([
    ['ACTIVE', 'Active', 'success'],
    ['DISABLED', 'Disabled', 'neutral'],
    ['SCHEDULED', 'Scheduled', 'warning'],
    ['EXPIRED', 'Expired', 'danger'],
  ] as const)(
    'maps %s to its visible lifecycle label',
    (status, label, tone) => {
      expect(getLifecyclePresentation(status)).toEqual({ label, tone });
    },
  );
});
