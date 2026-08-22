import { parseCartToken } from './cart-token';

export type CartCookieMode = 'local-http' | 'secure-https';
export type CartCookieRead =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'present'; rawToken: string }>;

const CART_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function getCartCookieName(mode: CartCookieMode): string {
  return mode === 'secure-https' ? '__Host-hb_cart' : 'hb_cart';
}

export function createCartCookie(
  mode: CartCookieMode,
  token: string,
  expiresAt: Date,
): string {
  return serializeCartCookie(
    mode,
    token,
    `Max-Age=${CART_MAX_AGE_SECONDS}; Expires=${expiresAt.toUTCString()}`,
  );
}

export function clearCartCookie(mode: CartCookieMode): string {
  return serializeCartCookie(
    mode,
    '',
    'Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  );
}

export function readCartCookie(
  header: string | undefined,
  mode: CartCookieMode,
): CartCookieRead {
  if (!header) return { kind: 'absent' };
  const expectedName = getCartCookieName(mode);
  const matches: string[] = [];
  for (const segment of header.split(';')) {
    const separator = segment.indexOf('=');
    if (separator <= 0) {
      if (segment.trim() === expectedName) return { kind: 'invalid' };
      continue;
    }
    if (segment.slice(0, separator).trim() !== expectedName) continue;
    matches.push(segment.slice(separator + 1).trim());
  }
  if (matches.length === 0) return { kind: 'absent' };
  if (matches.length !== 1) return { kind: 'invalid' };
  const rawToken = parseCartToken(matches[0]);
  return rawToken ? { kind: 'present', rawToken } : { kind: 'invalid' };
}

function serializeCartCookie(
  mode: CartCookieMode,
  value: string,
  expiry: string,
): string {
  const secure = mode === 'secure-https' ? '; Secure' : '';
  return `${getCartCookieName(mode)}=${value}; ${expiry}; Path=/; HttpOnly${secure}; SameSite=Lax`;
}
