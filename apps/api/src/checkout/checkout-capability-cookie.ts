import { parseCheckoutCapability } from './checkout-capability-token';

export type CheckoutCookieMode = 'local-http' | 'secure-https';
export type CheckoutCapabilityCookieRead =
  | Readonly<{ kind: 'absent' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'present'; rawToken: string }>;

const CHECKOUT_CAPABILITY_MAX_AGE_SECONDS = 24 * 60 * 60;

export function getCheckoutCapabilityCookieName(
  mode: CheckoutCookieMode,
): string {
  return mode === 'secure-https'
    ? '__Host-hb_guest_checkout'
    : 'hb_guest_checkout';
}

export function createCheckoutCapabilityCookie(
  mode: CheckoutCookieMode,
  token: string,
  expiresAt: Date,
): string {
  const secure = mode === 'secure-https' ? '; Secure' : '';
  return `${getCheckoutCapabilityCookieName(mode)}=${token}; Max-Age=${CHECKOUT_CAPABILITY_MAX_AGE_SECONDS}; Expires=${expiresAt.toUTCString()}; Path=/; HttpOnly${secure}; SameSite=Lax`;
}

export function readCheckoutCapabilityCookie(
  header: string | undefined,
  mode: CheckoutCookieMode,
): CheckoutCapabilityCookieRead {
  if (!header) return { kind: 'absent' };
  const expectedName = getCheckoutCapabilityCookieName(mode);
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
  const rawToken = parseCheckoutCapability(matches[0]);
  return rawToken ? { kind: 'present', rawToken } : { kind: 'invalid' };
}
