import { describe, expect, it } from 'vitest';

import {
  safeReturnPath,
  validateLoginInput,
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
