import {
  createCheckoutCapabilityCookie,
  getCheckoutCapabilityCookieName,
  readCheckoutCapabilityCookie,
} from './checkout-capability-cookie';
import {
  deriveCheckoutCapability,
  hashCheckoutCapability,
  parseCheckoutCapability,
} from './checkout-capability-token';

describe('guest checkout capability', () => {
  it('derives a stable opaque token from the cart proof and canonical request', () => {
    const requestHash = Buffer.alloc(32, 0x11);
    const expiresAt = new Date('2026-09-10T12:00:00.000Z');
    const first = deriveCheckoutCapability(
      'A'.repeat(43),
      'checkout-request-0001',
      requestHash,
      expiresAt,
    );
    const replay = deriveCheckoutCapability(
      'A'.repeat(43),
      'checkout-request-0001',
      requestHash,
      expiresAt,
    );
    const second = deriveCheckoutCapability(
      'B'.repeat(43),
      'checkout-request-0001',
      requestHash,
      expiresAt,
    );
    const changedKey = deriveCheckoutCapability(
      'A'.repeat(43),
      'checkout-request-0002',
      requestHash,
      expiresAt,
    );
    const changedRequest = deriveCheckoutCapability(
      'A'.repeat(43),
      'checkout-request-0001',
      Buffer.alloc(32, 0x22),
      expiresAt,
    );
    expect(first).toHaveLength(43);
    expect(second).toHaveLength(43);
    expect(first).not.toBe(second);
    expect(first).not.toBe(changedKey);
    expect(first).not.toBe(changedRequest);
    expect(first).toBe(replay);
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

    expect(
      createCheckoutCapabilityCookie(
        'local-http',
        token,
        expiresAt,
        new Date('2026-09-10T11:30:00.000Z'),
      ),
    ).toContain('Max-Age=1800; Expires=Thu, 10 Sep 2026 12:00:00 GMT');
  });
});
