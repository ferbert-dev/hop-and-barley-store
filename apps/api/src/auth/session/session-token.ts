import { createHash, randomBytes } from 'node:crypto';

const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function generateSessionToken(): string {
  return randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
}

export function parseSessionToken(candidate: unknown): string | null {
  if (typeof candidate !== 'string' || !SESSION_TOKEN_PATTERN.test(candidate)) {
    return null;
  }

  const decoded = Buffer.from(candidate, 'base64url');
  if (
    decoded.length !== SESSION_TOKEN_BYTES ||
    decoded.toString('base64url') !== candidate
  ) {
    return null;
  }

  return candidate;
}

export function hashSessionToken(token: string): Buffer {
  return createHash('sha256').update(token, 'ascii').digest();
}
