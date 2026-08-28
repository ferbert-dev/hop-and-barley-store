import {
  clearSessionCookie,
  createSessionCookie,
  getSessionCookieName,
  readSessionCookie,
} from './session-cookie';

const TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const EXPIRES_AT = new Date('2026-09-21T10:00:00.000Z');

describe('session cookies', () => {
  it('uses a browser-session cookie without persistence attributes by default', () => {
    expect(getSessionCookieName('local-http')).toBe('hb_session');
    expect(createSessionCookie('local-http', TOKEN, EXPIRES_AT, false)).toBe(
      'hb_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA; Path=/; HttpOnly; SameSite=Lax',
    );
  });

  it('uses a 30-day persistent secure __Host- cookie only when remembered', () => {
    expect(getSessionCookieName('secure-https')).toBe('__Host-hb_session');
    expect(createSessionCookie('secure-https', TOKEN, EXPIRES_AT, true)).toBe(
      '__Host-hb_session=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA; Max-Age=2592000; Expires=Mon, 21 Sep 2026 10:00:00 GMT; Path=/; HttpOnly; Secure; SameSite=Lax',
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
