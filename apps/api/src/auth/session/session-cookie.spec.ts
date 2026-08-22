import {
  clearSessionCookie,
  createSessionCookie,
  getSessionCookieName,
  readSessionCookie,
} from './session-cookie';

const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const EXPIRES_AT = new Date('2026-08-29T10:00:00.000Z');

describe('session cookies', () => {
  it('uses an explicit host-only local HTTP cookie contract', () => {
    expect(getSessionCookieName('local-http')).toBe('hb_session');
    expect(createSessionCookie('local-http', TOKEN, EXPIRES_AT)).toBe(
      'hb_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA; Max-Age=604800; Expires=Sat, 29 Aug 2026 10:00:00 GMT; Path=/; HttpOnly; SameSite=Lax',
    );
  });

  it('uses the secure __Host- cookie only in explicit HTTPS mode', () => {
    expect(getSessionCookieName('secure-https')).toBe('__Host-hb_session');
    expect(createSessionCookie('secure-https', TOKEN, EXPIRES_AT)).toBe(
      '__Host-hb_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA; Max-Age=604800; Expires=Sat, 29 Aug 2026 10:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('clears the configured cookie with matching host-only attributes', () => {
    expect(clearSessionCookie('secure-https')).toBe(
      '__Host-hb_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax',
    );
  });

  it('parses exactly one configured canonical cookie and rejects ambiguity', () => {
    expect(
      readSessionCookie(`other=x; hb_session=${TOKEN}`, 'local-http'),
    ).toBe(TOKEN);
    expect(
      readSessionCookie(
        `hb_session=${TOKEN}; hb_session=${TOKEN}`,
        'local-http',
      ),
    ).toBeNull();
    expect(
      readSessionCookie(`__Host-hb_session=${TOKEN}`, 'local-http'),
    ).toBeNull();
    expect(readSessionCookie('hb_session=not-valid', 'local-http')).toBeNull();
  });
});
