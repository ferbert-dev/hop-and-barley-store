import {
  generateSessionToken,
  hashSessionToken,
  parseSessionToken,
} from './session-token';

describe('session token primitives', () => {
  it('generates 32 random bytes as a canonical 43-character base64url token', () => {
    const first = generateSessionToken();
    const second = generateSessionToken();

    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(second).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
    expect(parseSessionToken(first)).toBe(first);
  });

  it('stores only the deterministic 32-byte SHA-256 token hash', () => {
    const token = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const hash = hashSessionToken(token);

    expect(hash).toBeInstanceOf(Buffer);
    expect(hash).toHaveLength(32);
    expect(hash.toString('hex')).toBe(
      '0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a',
    );
    expect(hash.toString()).not.toContain(token);
  });

  it.each([
    '',
    'short',
    'A'.repeat(42),
    'A'.repeat(44),
    `${'A'.repeat(42)}=`,
    `${'A'.repeat(42)}+`,
  ])('rejects a malformed or non-canonical token: %s', (candidate) => {
    expect(parseSessionToken(candidate)).toBeNull();
  });
});
