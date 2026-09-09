import { createHash, randomBytes } from 'node:crypto';

const CHECKOUT_CAPABILITY_BYTES = 32;
const CHECKOUT_CAPABILITY_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateCheckoutCapability(): string {
  return randomBytes(CHECKOUT_CAPABILITY_BYTES).toString('base64url');
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
