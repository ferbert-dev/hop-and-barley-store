import { describe, expect, it } from 'vitest';

import {
  parseUpstreamSessionCookie,
  selectSessionCookieHeader,
} from './auth-cookie';

describe('auth cookie transport', () => {
  it('preserves a browser-session host-only HttpOnly cookie', () => {
    expect(
      parseUpstreamSessionCookie(
        `hb_session=${'A'.repeat(43)}; Path=/; HttpOnly; SameSite=Lax`,
      ),
    ).toEqual({
      httpOnly: true,
      name: 'hb_session',
      path: '/',
      sameSite: 'lax',
      secure: false,
      value: 'A'.repeat(43),
    });
  });

  it('preserves the exact 30-day persistent cookie contract', () => {
    expect(
      parseUpstreamSessionCookie(
        `hb_session=${'A'.repeat(43)}; Max-Age=2592000; Expires=Mon, 21 Sep 2026 10:00:00 GMT; Path=/; HttpOnly; SameSite=Lax`,
      ),
    ).toMatchObject({
      expires: new Date('2026-09-21T10:00:00.000Z'),
      maxAge: 2_592_000,
      name: 'hb_session',
      value: 'A'.repeat(43),
    });
  });

  it('preserves the secure clear-cookie contract', () => {
    expect(
      parseUpstreamSessionCookie(
        '__Host-hb_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax',
      ),
    ).toMatchObject({
      httpOnly: true,
      maxAge: 0,
      name: '__Host-hb_session',
      secure: true,
      value: '',
    });
  });

  it.each([
    `hb_session=${'A'.repeat(43)}; Domain=example.com; Path=/; HttpOnly; SameSite=Lax`,
    `hb_session=${'A'.repeat(43)}; Path=/; SameSite=Lax`,
    `__Host-hb_session=${'A'.repeat(43)}; Path=/; HttpOnly; SameSite=Lax`,
    `hb_session=${'A'.repeat(43)}; Max-Age=2592000; Path=/; HttpOnly; SameSite=Lax`,
    `hb_session=${'A'.repeat(43)}; Expires=Mon, 21 Sep 2026 10:00:00 GMT; Path=/; HttpOnly; SameSite=Lax`,
    `other=${'A'.repeat(43)}; Path=/; HttpOnly; SameSite=Lax`,
  ])('fails closed for a weakened upstream cookie: %s', (header) => {
    expect(() => parseUpstreamSessionCookie(header)).toThrow(
      'Invalid upstream session cookie',
    );
  });

  it('forwards only one known incoming session cookie', () => {
    expect(
      selectSessionCookieHeader([
        { name: 'theme', value: 'dark' },
        { name: 'hb_session', value: 'session-value' },
      ]),
    ).toBe('hb_session=session-value');

    expect(
      selectSessionCookieHeader([
        { name: 'hb_session', value: 'one' },
        { name: '__Host-hb_session', value: 'two' },
      ]),
    ).toBeNull();
  });
});
