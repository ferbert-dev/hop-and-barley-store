import { describe, expect, it } from 'vitest';

import {
  CHECKOUT_HANDOFF_KEY,
  clearCheckoutHandoff,
  MAX_GUEST_HANDOFF_AGE_MS,
  readCheckoutHandoff,
  storeCheckoutHandoff,
} from './checkout-handoff';

const draft = {
  delivery: { city: 'Berlin', countryCode: 'DE', street: 'Hopfenstraße' },
  email: 'brewer@example.com',
  fullName: 'Alex Brewer',
  paymentMethod: 'stripe_debit_card' as const,
  phoneNumber: '+4912345678',
};

describe('checkout auth handoff', () => {
  it('stores only the required draft fields with bounded issued and expiry metadata', () => {
    const storage = new MapStorage();
    const now = Date.parse('2026-09-10T10:00:00.000Z');

    storeCheckoutHandoff(storage, draft, '2026-09-12T10:00:00.000Z', now);

    const stored = JSON.parse(storage.getItem(CHECKOUT_HANDOFF_KEY) ?? '{}');
    expect(stored).toMatchObject({
      draft: {
        email: draft.email,
        fullName: draft.fullName,
        phoneNumber: draft.phoneNumber,
      },
      issuedAt: '2026-09-10T10:00:00.000Z',
      version: 2,
    });
    expect(stored.draft.paymentMethod).toBeUndefined();
    expect(Date.parse(stored.expiresAt) - now).toBe(MAX_GUEST_HANDOFF_AGE_MS);
  });

  it('uses an earlier guest capability expiry and restores the fixed payment method', () => {
    const storage = new MapStorage();
    const now = Date.parse('2026-09-10T10:00:00.000Z');
    storeCheckoutHandoff(storage, draft, '2026-09-10T12:00:00.000Z', now);

    expect(readCheckoutHandoff(storage, now + 60_000)).toEqual(draft);
  });

  it('does not extend a known expired server capability', () => {
    const storage = new MapStorage();
    const now = Date.parse('2026-09-10T10:00:00.000Z');
    storeCheckoutHandoff(storage, draft, '2026-09-09T10:00:00.000Z', now);

    expect(readCheckoutHandoff(storage, now)).toBeNull();
    expect(storage.getItem(CHECKOUT_HANDOFF_KEY)).toBeNull();
  });

  it('clears expired and malformed state instead of reposting it', () => {
    const storage = new MapStorage();
    const now = Date.parse('2026-09-10T10:00:00.000Z');
    storeCheckoutHandoff(storage, draft, null, now);

    expect(
      readCheckoutHandoff(storage, now + MAX_GUEST_HANDOFF_AGE_MS),
    ).toBeNull();
    expect(storage.getItem(CHECKOUT_HANDOFF_KEY)).toBeNull();

    storage.setItem(CHECKOUT_HANDOFF_KEY, '{bad json');
    expect(readCheckoutHandoff(storage, now)).toBeNull();
    expect(storage.getItem(CHECKOUT_HANDOFF_KEY)).toBeNull();
  });

  it('clears handoff state on a terminal path', () => {
    const storage = new MapStorage();
    storeCheckoutHandoff(storage, draft, null, Date.now());
    clearCheckoutHandoff(storage);
    expect(storage.getItem(CHECKOUT_HANDOFF_KEY)).toBeNull();
  });
});

class MapStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}
