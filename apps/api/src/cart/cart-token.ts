import { createHash, randomBytes } from 'node:crypto';

const CART_TOKEN_BYTES = 32;
const CART_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateCartToken(): string {
  return randomBytes(CART_TOKEN_BYTES).toString('base64url');
}

export function parseCartToken(candidate: unknown): string | null {
  if (typeof candidate !== 'string' || !CART_TOKEN_PATTERN.test(candidate)) {
    return null;
  }
  const decoded = Buffer.from(candidate, 'base64url');
  return decoded.length === CART_TOKEN_BYTES &&
    decoded.toString('base64url') === candidate
    ? candidate
    : null;
}

export function hashCartToken(token: string): Buffer {
  return createHash('sha256').update(token, 'ascii').digest();
}
