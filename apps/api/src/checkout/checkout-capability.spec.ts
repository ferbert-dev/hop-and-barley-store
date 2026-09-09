import {
  createCheckoutCapabilityCookie,
  getCheckoutCapabilityCookieName,
  readCheckoutCapabilityCookie,
} from './checkout-capability-cookie';
import {
  generateCheckoutCapability,
  hashCheckoutCapability,
  parseCheckoutCapability,
} from './checkout-capability-token';

describe('guest checkout capability', () => {
  it('generates an opaque 32-byte token and stores a deterministic SHA-256 digest', () => {
    const first = generateCheckoutCapability();
    const second = generateCheckoutCapability();
    expect(first).toHaveLength(43);
    expect(second).toHaveLength(43);
    expect(first).not.toBe(second);
    expect(parseCheckoutCapability(first)).toBe(first);
    expect(hashCheckoutCapability(first)).toHaveLength(32);
    expect(hashCheckoutCapability(first)).toEqual(
      hashCheckoutCapability(first),
    );
    expect(hashCheckoutCapability(first)).not.toEqual(
      hashCheckoutCapability(second),
    );
  });

  it('rejects malformed, non-canonical and ambiguous cookie capabilities', () => {
    for (const candidate of [
      undefined,
      '',
      'short',
      'A'.repeat(42),
      'A'.repeat(44),
    ]) {
      expect(parseCheckoutCapability(candidate)).toBeNull();
    }
    expect(readCheckoutCapabilityCookie(undefined, 'local-http')).toEqual({
      kind: 'absent',
    });
    expect(readCheckoutCapabilityCookie('theme=dark', 'local-http')).toEqual({
      kind: 'absent',
    });
    expect(
      readCheckoutCapabilityCookie('hb_guest_checkout=bad', 'local-http'),
    ).toEqual({ kind: 'invalid' });
    expect(
      readCheckoutCapabilityCookie(
        `hb_guest_checkout=${'A'.repeat(43)}; hb_guest_checkout=${'B'.repeat(43)}`,
        'local-http',
      ),
    ).toEqual({ kind: 'invalid' });
  });

  it('uses a host-only 24-hour HttpOnly cookie with Secure in HTTPS mode', () => {
    const token = 'A'.repeat(43);
    const expiresAt = new Date('2026-09-10T12:00:00.000Z');
    expect(getCheckoutCapabilityCookieName('local-http')).toBe(
      'hb_guest_checkout',
    );
    expect(createCheckoutCapabilityCookie('local-http', token, expiresAt)).toBe(
      `hb_guest_checkout=${token}; Max-Age=86400; Expires=Thu, 10 Sep 2026 12:00:00 GMT; Path=/; HttpOnly; SameSite=Lax`,
    );
    const secure = createCheckoutCapabilityCookie(
      'secure-https',
      token,
      expiresAt,
    );
    expect(secure).toContain('__Host-hb_guest_checkout=');
    expect(secure).toContain('; Path=/; HttpOnly; Secure; SameSite=Lax');
    expect(secure).not.toContain('Domain=');
  });
});
