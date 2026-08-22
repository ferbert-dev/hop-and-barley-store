export type AuthCredentials = Readonly<{
  email: string;
  password: string;
}>;

type AuthFieldErrors = Partial<Record<keyof AuthCredentials, string>>;

export type AuthValidationResult =
  | Readonly<{ errors: AuthFieldErrors; ok: false }>
  | Readonly<{ ok: true; value: AuthCredentials }>;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const AUTH_ENTRY_PATHS = new Set(['/login', '/register']);

export function validateRegistrationInput(
  input: AuthCredentials,
): AuthValidationResult {
  const email = input.email.trim();
  const password = input.password;
  const errors: AuthFieldErrors = {};

  if (!isValidEmailPresentation(email)) {
    errors.email = 'Enter a valid email address.';
  }

  const codePointLength = [...password].length;
  if (codePointLength < 15 || codePointLength > 128) {
    errors.password = 'Use between 15 and 128 characters.';
  } else if (password !== password.normalize('NFC')) {
    errors.password = 'Use a password in its normal composed form.';
  } else if (new TextEncoder().encode(password).byteLength > 512) {
    errors.password = 'Use a password no longer than 512 bytes.';
  }

  return Object.keys(errors).length > 0
    ? { errors, ok: false }
    : { ok: true, value: { email, password } };
}

export function validateLoginInput(
  input: AuthCredentials,
): AuthValidationResult {
  const email = input.email.trim();
  const password = input.password;
  const errors: AuthFieldErrors = {};

  if (email.length === 0) {
    errors.email = 'Enter your email address.';
  } else if (!isValidEmailPresentation(email)) {
    errors.email = 'Enter a valid email address.';
  }

  if (password.length === 0) {
    errors.password = 'Enter your password.';
  }

  return Object.keys(errors).length > 0
    ? { errors, ok: false }
    : { ok: true, value: { email, password } };
}

export function safeReturnPath(candidate: string | undefined): string {
  if (
    candidate === undefined ||
    candidate.length === 0 ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\') ||
    CONTROL_CHARACTER.test(candidate)
  ) {
    return '/';
  }

  let parsed: URL;
  try {
    parsed = new URL(candidate, 'http://auth-return.local');
  } catch {
    return '/';
  }

  if (
    parsed.origin !== 'http://auth-return.local' ||
    AUTH_ENTRY_PATHS.has(parsed.pathname)
  ) {
    return '/';
  }

  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function isValidEmailPresentation(email: string): boolean {
  return (
    email.length > 0 &&
    email.length <= 320 &&
    !CONTROL_CHARACTER.test(email) &&
    EMAIL_SHAPE.test(email)
  );
}
