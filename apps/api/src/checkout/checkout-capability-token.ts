import { createHash, createHmac } from 'node:crypto';

const CHECKOUT_CAPABILITY_BYTES = 32;
const CHECKOUT_CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const RECOVERY_CONTEXT = 'hop-and-barley/guest-checkout-capability/v1\0';

export function deriveCheckoutCapability(
  rawCartCapability: string,
  idempotencyKey: string,
  requestHash: Uint8Array,
  expiresAt: Date,
): string {
  return createHmac('sha256', Buffer.from(rawCartCapability, 'ascii'))
    .update(RECOVERY_CONTEXT, 'utf8')
    .update(idempotencyKey, 'utf8')
    .update('\0', 'utf8')
    .update(Buffer.from(requestHash))
    .update(expiresAt.toISOString(), 'ascii')
    .digest('base64url');
}

export function parseCheckoutCapability(candidate: unknown): string | null {
  if (
    typeof candidate !== 'string' ||
    !CHECKOUT_CAPABILITY_PATTERN.test(candidate)
  ) {
    return null;
  }
  const decoded = Buffer.from(candidate, 'base64url');
  return decoded.length === CHECKOUT_CAPABILITY_BYTES &&
    decoded.toString('base64url') === candidate
    ? candidate
    : null;
}

export function hashCheckoutCapability(token: string): Buffer {
  return createHash('sha256').update(token, 'ascii').digest();
}
