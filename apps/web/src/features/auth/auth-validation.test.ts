import { describe, expect, it } from 'vitest';

import {
  safeReturnPath,
  validateLoginInput,
  validateRecoveryEmail,
  validateRegistrationInput,
} from './auth-validation';

describe('auth presentation validation', () => {
  it('accepts exactly 12 total characters when all categories are within them', () => {
    expect(
      validateRegistrationInput({
        confirmPassword: 'Abcdefghi1!x',
        email: ' brewer@example.com ',
        password: 'Abcdefghi1!x',
      }),
    ).toEqual({
      ok: true,
      value: {
        email: 'brewer@example.com',
        password: 'Abcdefghi1!x',
      },
    });
  });

  it('applies the password policy after NFC normalization', () => {
    const password = 'A\u0301bcdefg1!xy';
    const result = validateRegistrationInput({
      confirmPassword: password,
      email: 'brewer@example.com',
      password,
    });

    expect(result).toMatchObject({
      errors: { password: 'At least 12 characters total' },
      ok: false,
    });
  });

  it('returns the canonical password for registration transport', () => {
    expect(
      validateRegistrationInput({
        confirmPassword: 'Cafe\u0301Strong1!',
        email: 'brewer@example.com',
        password: 'CaféStrong1!',
      }),
    ).toEqual({
      ok: true,
      value: {
        email: 'brewer@example.com',
        password: 'CaféStrong1!',
      },
    });
  });

  it('rejects control characters without adding a visible password rule', () => {
    const unsafeControlInput = [
      'Abcd',
      'efgh',
      '1!',
      String.fromCodePoint(0),
      'x',
    ].join('');
    const result = validateRegistrationInput({
      confirmPassword: unsafeControlInput,
      email: 'brewer@example.com',
      password: unsafeControlInput,
    });

    expect(result).toMatchObject({
      errors: { password: 'Enter a valid password.' },
      ok: false,
    });
  });

  it.each([
    ['fewer than 12 total characters', 'Abcdefg1!x'],
    ['no lowercase letter', 'ABCDEFGHI1!X'],
    ['no uppercase letter', 'abcdefghi1!x'],
    ['no digit', 'Abcdefghij!x'],
    ['no special character', 'Abcdefghi12x'],
  ])('rejects %s', (_case, password) => {
    const result = validateRegistrationInput({
      confirmPassword: password,
      email: 'brewer@example.com',
      password,
    });
    expect(result).toMatchObject({ ok: false });
    if (result.ok) throw new Error('Expected registration validation failure');
    expect(result.errors.password).toBeDefined();
    expect(JSON.stringify(result)).not.toContain(password);
  });

  it('rejects empty and malformed email with field-safe errors', () => {
    for (const email of ['', 'not-an-email']) {
      const result = validateRegistrationInput({
        confirmPassword: 'Abcdefghi1!x',
        email,
        password: 'Abcdefghi1!x',
      });
      expect(result).toMatchObject({
        errors: { email: expect.any(String) },
        ok: false,
      });
    }
  });

  it('rejects a missing or mismatched confirmation without returning it', () => {
    const missing = validateRegistrationInput({
      confirmPassword: '',
      email: 'brewer@example.com',
      password: 'Abcdefghi1!x',
    });
    expect(missing).toMatchObject({
      errors: { confirmPassword: 'Confirm your password.' },
      ok: false,
    });

    const mismatch = validateRegistrationInput({
      confirmPassword: 'Abcdefghi1!y',
      email: 'brewer@example.com',
      password: 'Abcdefghi1!x',
    });
    expect(mismatch).toMatchObject({
      errors: { confirmPassword: 'Passwords do not match.' },
      ok: false,
    });
    expect(JSON.stringify(mismatch)).not.toContain('Abcdefghi1!y');
  });

  it('keeps login failure validation generic', () => {
    expect(validateLoginInput({ email: '', password: '' })).toEqual({
      errors: {
        email: 'Enter your email address.',
        password: 'Enter your password.',
      },
      ok: false,
    });
  });

  it.each([
    ['', 'Enter your email address.'],
    ['not-an-email', 'Enter a valid email address.'],
  ])('rejects recovery email %j locally', (email, error) => {
    expect(validateRecoveryEmail(email)).toEqual({ error, ok: false });
  });

  it('accepts and trims a well-formed recovery email', () => {
    expect(validateRecoveryEmail(' brewer@example.com ')).toEqual({
      ok: true,
      value: 'brewer@example.com',
    });
  });
});

describe('safeReturnPath', () => {
  it.each(['/account', '/account?tab=orders', '/product/citra-hops'])(
    'allows the internal path %s',
    (path) => expect(safeReturnPath(path)).toBe(path),
  );

  it.each([
    undefined,
    '',
    'https://evil.example/steal',
    '//evil.example/steal',
    '/\\evil.example/steal',
    '/login',
    '/register',
    '/account\nSet-Cookie: stolen=true',
  ])('falls back safely for %s', (path) => {
    expect(safeReturnPath(path)).toBe('/');
  });
});
