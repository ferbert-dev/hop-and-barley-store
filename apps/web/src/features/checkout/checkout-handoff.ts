import type { SaveCheckoutDraft } from './checkout-transport';

export const CHECKOUT_HANDOFF_KEY = 'hb-checkout-draft-handoff-v2';
export const MAX_GUEST_HANDOFF_AGE_MS = 24 * 60 * 60 * 1_000;

type HandoffDraft = Omit<SaveCheckoutDraft, 'paymentMethod'>;

type CheckoutHandoff = Readonly<{
  draft: HandoffDraft;
  expiresAt: string;
  issuedAt: string;
  version: 2;
}>;

export function storeCheckoutHandoff(
  storage: Storage,
  draft: SaveCheckoutDraft,
  serverExpiresAt: string | null,
  now = Date.now(),
) {
  const expiresAt = boundedExpiry(serverExpiresAt, now);
  const handoffDraft: HandoffDraft = {
    delivery: draft.delivery,
    email: draft.email,
    fullName: draft.fullName,
    phoneNumber: draft.phoneNumber,
  };
  const handoff: CheckoutHandoff = {
    draft: handoffDraft,
    expiresAt: new Date(expiresAt).toISOString(),
    issuedAt: new Date(now).toISOString(),
    version: 2,
  };
  storage.setItem(CHECKOUT_HANDOFF_KEY, JSON.stringify(handoff));
}

export function readCheckoutHandoff(
  storage: Storage,
  now = Date.now(),
): SaveCheckoutDraft | null {
  try {
    const raw = storage.getItem(CHECKOUT_HANDOFF_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isValidHandoff(parsed, now)) {
      clearCheckoutHandoff(storage);
      return null;
    }
    return { ...parsed.draft, paymentMethod: 'stripe_debit_card' };
  } catch {
    clearCheckoutHandoff(storage);
    return null;
  }
}

export function clearCheckoutHandoff(storage: Storage) {
  storage.removeItem(CHECKOUT_HANDOFF_KEY);
}

function boundedExpiry(serverExpiresAt: string | null, now: number) {
  const maximum = now + MAX_GUEST_HANDOFF_AGE_MS;
  if (serverExpiresAt === null) return maximum;
  const serverExpiry = Date.parse(serverExpiresAt);
  if (!Number.isFinite(serverExpiry) || serverExpiry <= now) return now;
  return Math.min(serverExpiry, maximum);
}

function isValidHandoff(value: unknown, now: number): value is CheckoutHandoff {
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.draft)) {
    return false;
  }
  const issuedAt = Date.parse(String(value.issuedAt));
  const expiresAt = Date.parse(String(value.expiresAt));
  if (
    !Number.isFinite(issuedAt) ||
    !Number.isFinite(expiresAt) ||
    issuedAt > now ||
    expiresAt <= now ||
    expiresAt > issuedAt + MAX_GUEST_HANDOFF_AGE_MS
  ) {
    return false;
  }
  const { draft } = value;
  return (
    typeof draft.email === 'string' &&
    typeof draft.fullName === 'string' &&
    typeof draft.phoneNumber === 'string' &&
    isRecord(draft.delivery) &&
    typeof draft.delivery.countryCode === 'string' &&
    typeof draft.delivery.city === 'string' &&
    typeof draft.delivery.street === 'string'
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
