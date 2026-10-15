export const PAYMENT_HANDOFF_KEY = 'hb-checkout-payment-v1';

export type CheckoutPaymentHandoff = {
  draftId: string;
  key: string;
  attemptId?: string;
  settled?: 'succeeded';
};

type PaymentHandoffStorage = Pick<
  Storage,
  'getItem' | 'removeItem' | 'setItem'
>;

// No address, amount, credentials or hosted URL is persisted here. The server
// remains authoritative; this record only correlates an idempotent request.
export function readPaymentHandoff(
  storage: PaymentHandoffStorage,
): CheckoutPaymentHandoff | null {
  const raw = storage.getItem(PAYMENT_HANDOFF_KEY);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid payment handoff');
  }
  const record = value as Record<string, unknown>;
  const uuid =
    /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
  if (
    typeof record.draftId !== 'string' ||
    !uuid.test(record.draftId) ||
    typeof record.key !== 'string' ||
    !uuid.test(record.key) ||
    (record.attemptId !== undefined &&
      (typeof record.attemptId !== 'string' || !uuid.test(record.attemptId))) ||
    (record.settled !== undefined &&
      (record.settled !== 'succeeded' || record.attemptId === undefined))
  ) {
    throw new Error('Invalid payment handoff');
  }
  return record as CheckoutPaymentHandoff;
}

export function markPaymentHandoffSucceeded(
  storage: PaymentHandoffStorage,
  saved: CheckoutPaymentHandoff | null,
): CheckoutPaymentHandoff & { attemptId: string; settled: 'succeeded' } {
  if (!saved?.attemptId) {
    throw new Error('Missing correlated payment attempt');
  }
  const persisted = readPaymentHandoff(storage);
  if (!persisted || !samePaymentHandoff(persisted, saved)) {
    throw new Error('Payment handoff changed');
  }
  const settled = {
    ...persisted,
    attemptId: saved.attemptId,
    settled: 'succeeded' as const,
  };
  storage.setItem(PAYMENT_HANDOFF_KEY, JSON.stringify(settled));

  const verified = readPaymentHandoff(storage);
  if (
    verified?.settled !== 'succeeded' ||
    !samePaymentHandoff(verified, settled)
  ) {
    throw new Error('Payment handoff could not be marked as succeeded');
  }
  return settled;
}

export function clearSucceededPaymentHandoff(
  storage: PaymentHandoffStorage,
  saved: CheckoutPaymentHandoff,
): void {
  const persisted = readPaymentHandoff(storage);
  if (
    saved.settled !== 'succeeded' ||
    persisted?.settled !== 'succeeded' ||
    !samePaymentHandoff(persisted, saved)
  ) {
    throw new Error('Payment handoff changed');
  }
  storage.removeItem(PAYMENT_HANDOFF_KEY);
  if (storage.getItem(PAYMENT_HANDOFF_KEY) !== null) {
    throw new Error('Payment handoff could not be cleared');
  }
}

export function samePaymentHandoff(
  left: CheckoutPaymentHandoff | null,
  right: CheckoutPaymentHandoff,
): boolean {
  return (
    left?.attemptId === right.attemptId &&
    left?.draftId === right.draftId &&
    left?.key === right.key
  );
}
