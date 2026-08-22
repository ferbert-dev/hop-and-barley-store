import { parseSessionToken } from './session-token';

export type AuthCookieMode = 'local-http' | 'secure-https';

const ABSOLUTE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export function getSessionCookieName(mode: AuthCookieMode): string {
  return mode === 'secure-https' ? '__Host-hb_session' : 'hb_session';
}

export function createSessionCookie(
  mode: AuthCookieMode,
  token: string,
  expiresAt: Date,
): string {
  return serializeCookie(
    mode,
    token,
    `Max-Age=${ABSOLUTE_MAX_AGE_SECONDS}; Expires=${expiresAt.toUTCString()}`,
  );
}

export function clearSessionCookie(mode: AuthCookieMode): string {
  return serializeCookie(
    mode,
    '',
    'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  );
}

export function readSessionCookie(
  header: string | undefined,
  mode: AuthCookieMode,
): string | null {
  if (!header) return null;
  const expectedName = getSessionCookieName(mode);
  const matches: string[] = [];

  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');
    if (separator <= 0) continue;
    const name = segment.slice(0, separator).trim();
    if (name !== expectedName) continue;
    matches.push(segment.slice(separator + 1).trim());
  }

  if (matches.length !== 1) return null;
  return parseSessionToken(matches[0]);
}

function serializeCookie(
  mode: AuthCookieMode,
  value: string,
  expiry: string,
): string {
  const secure = mode === 'secure-https' ? '; Secure' : '';
  return `${getSessionCookieName(mode)}=${value}; ${expiry}; Path=/; HttpOnly${secure}; SameSite=Lax`;
}
