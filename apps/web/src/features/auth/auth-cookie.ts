export type IncomingCookie = Readonly<{ name: string; value: string }>;

export type SessionCookie = Readonly<{
  expires: Date;
  httpOnly: true;
  maxAge: number;
  name: 'hb_session' | '__Host-hb_session';
  path: '/';
  sameSite: 'lax';
  secure: boolean;
  value: string;
}>;

const SESSION_COOKIE_NAMES = new Set(['hb_session', '__Host-hb_session']);
const SESSION_TOKEN = /^[A-Za-z0-9_-]{43}$/u;

export function selectSessionCookieHeader(
  cookies: readonly IncomingCookie[],
): string | null {
  const sessions = cookies.filter(({ name }) => SESSION_COOKIE_NAMES.has(name));

  if (sessions.length !== 1) return null;
  const [{ name, value }] = sessions;
  if (!name || !value) return null;

  return `${name}=${value}`;
}

export function parseUpstreamSessionCookie(header: string): SessionCookie {
  const segments = header.split(';').map((segment) => segment.trim());
  const pair = segments.shift();
  if (!pair) throwInvalidCookie();

  const separator = pair.indexOf('=');
  if (separator <= 0) throwInvalidCookie();

  const name = pair.slice(0, separator);
  const value = pair.slice(separator + 1);
  if (
    (name !== 'hb_session' && name !== '__Host-hb_session') ||
    (value !== '' && !SESSION_TOKEN.test(value))
  ) {
    throwInvalidCookie();
  }

  const attributes = new Map<string, string | true>();
  for (const segment of segments) {
    const equals = segment.indexOf('=');
    const key = (equals === -1 ? segment : segment.slice(0, equals))
      .trim()
      .toLowerCase();
    const attributeValue =
      equals === -1 ? true : segment.slice(equals + 1).trim();
    if (key.length === 0 || attributes.has(key)) throwInvalidCookie();
    attributes.set(key, attributeValue);
  }

  const allowedAttributes = new Set([
    'expires',
    'httponly',
    'max-age',
    'path',
    'samesite',
    'secure',
  ]);
  if ([...attributes.keys()].some((key) => !allowedAttributes.has(key))) {
    throwInvalidCookie();
  }

  const maxAgeValue = attributes.get('max-age');
  const expiresValue = attributes.get('expires');
  const maxAge =
    typeof maxAgeValue === 'string' && /^\d+$/u.test(maxAgeValue)
      ? Number(maxAgeValue)
      : Number.NaN;
  const expires =
    typeof expiresValue === 'string'
      ? new Date(expiresValue)
      : new Date(Number.NaN);
  const secure = attributes.get('secure') === true;

  if (
    (maxAge !== 0 && maxAge !== 604800) ||
    Number.isNaN(expires.getTime()) ||
    attributes.get('path') !== '/' ||
    attributes.get('httponly') !== true ||
    attributes.get('samesite') !== 'Lax' ||
    (name === '__Host-hb_session' && !secure) ||
    (name === 'hb_session' && secure) ||
    (maxAge === 0 && value !== '') ||
    (maxAge === 604800 && value === '')
  ) {
    throwInvalidCookie();
  }

  return {
    expires,
    httpOnly: true,
    maxAge,
    name,
    path: '/',
    sameSite: 'lax',
    secure,
    value,
  };
}

function throwInvalidCookie(): never {
  throw new TypeError('Invalid upstream session cookie');
}
