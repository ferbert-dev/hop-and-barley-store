import {
  createCartCookie,
  getCartCookieName,
  readCartCookie,
} from './cart-cookie';

const token = 'A'.repeat(43);

describe('cart cookie', () => {
  it('uses a host-only non-Secure cookie only for loopback HTTP', () => {
    expect(getCartCookieName('local-http')).toBe('hb_cart');
    expect(
      createCartCookie(
        'local-http',
        token,
        new Date('2026-09-21T00:00:00.000Z'),
      ),
    ).toMatch(
      /^hb_cart=.+; Max-Age=2592000; Expires=.+; Path=\/; HttpOnly; SameSite=Lax$/,
    );
  });

  it('uses the __Host prefix and Secure for HTTPS', () => {
    const cookie = createCartCookie(
      'secure-https',
      token,
      new Date('2026-09-21T00:00:00.000Z'),
    );
    expect(cookie).toContain('__Host-hb_cart=');
    expect(cookie).toContain('; Secure; SameSite=Lax');
    expect(cookie).not.toContain('Domain=');
  });

  it('distinguishes absence from malformed and ambiguous capability cookies', () => {
    expect(readCartCookie(undefined, 'local-http')).toEqual({ kind: 'absent' });
    expect(readCartCookie('theme=dark', 'local-http')).toEqual({
      kind: 'absent',
    });
    expect(readCartCookie('hb_cart=bad', 'local-http')).toEqual({
      kind: 'invalid',
    });
    expect(readCartCookie('hb_cart', 'local-http')).toEqual({
      kind: 'invalid',
    });
    expect(readCartCookie(`hb_cart=${token}; hb_cart`, 'local-http')).toEqual({
      kind: 'invalid',
    });
    expect(
      readCartCookie(
        `hb_cart=${token}; hb_cart=${'B'.repeat(43)}`,
        'local-http',
      ),
    ).toEqual({ kind: 'invalid' });
    expect(readCartCookie(`hb_cart=${token}`, 'local-http')).toEqual({
      kind: 'present',
      rawToken: token,
    });
  });
});
