import { generateCartToken, hashCartToken, parseCartToken } from './cart-token';

describe('cart capability token', () => {
  it('generates a canonical 32-byte opaque token and hashes it with SHA-256', () => {
    const token = generateCartToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(token, 'base64url')).toHaveLength(32);
    expect(parseCartToken(token)).toBe(token);
    expect(hashCartToken(token)).toHaveLength(32);
    expect(hashCartToken(token)).not.toContain(Buffer.from(token, 'ascii'));
  });

  it.each(['', 'short', `${'A'.repeat(42)}=`, `${'A'.repeat(44)}`])(
    'rejects malformed token %j',
    (candidate) => {
      expect(parseCartToken(candidate)).toBeNull();
    },
  );
});
