import { registrationFormSchema } from '@hop-and-barley/auth-contract';

export type AuthCredentials = Readonly<{
  email: string;
  password: string;
}>;

export type RegistrationFormInput = AuthCredentials &
  Readonly<{ confirmPassword: string }>;

export type AuthFieldName = keyof RegistrationFormInput;
type AuthFieldErrors = Partial<Record<AuthFieldName, string>>;

export type AuthValidationResult =
  | Readonly<{ errors: AuthFieldErrors; ok: false }>
  | Readonly<{ ok: true; value: AuthCredentials }>;

export type RecoveryEmailValidationResult =
  | Readonly<{ error: string; ok: false }>
  | Readonly<{ ok: true; value: string }>;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/u;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;
const AUTH_ENTRY_PATHS = new Set(['/login', '/register']);

export function validateRegistrationInput(
  input: RegistrationFormInput,
): AuthValidationResult {
  const email = input.email.trim();
  const result = registrationFormSchema.safeParse({ ...input, email });
  if (result.success) {
    return {
      ok: true,
      value: { email: result.data.email, password: result.data.password },
    };
  }

  const errors: AuthFieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0];
    if (
      (field === 'email' ||
        field === 'password' ||
        field === 'confirmPassword') &&
      errors[field] === undefined
    ) {
      errors[field] = issue.message;
    }
  }
  return { errors, ok: false };
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

export function validateRecoveryEmail(
  candidate: string,
): RecoveryEmailValidationResult {
  const email = candidate.trim();

  if (email.length === 0) {
    return { error: 'Enter your email address.', ok: false };
  }
  if (!isValidEmailPresentation(email)) {
    return { error: 'Enter a valid email address.', ok: false };
  }
  return { ok: true, value: email };
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
