import { describe, expect, it } from 'vitest';

import {
  safeReturnPath,
  validateLoginInput,
  validateRegistrationInput,
} from './auth-validation';

describe('auth presentation validation', () => {
  it('accepts the A1 registration boundary without retaining credentials', () => {
    expect(
      validateRegistrationInput({
        email: ' brewer@example.com ',
        password: 'correct horse battery staple',
      }),
    ).toEqual({
      ok: true,
      value: {
        email: 'brewer@example.com',
        password: 'correct horse battery staple',
      },
    });
  });

  it('returns field-only registration errors and never reflects a password', () => {
    const password = 'short-secret';
    const result = validateRegistrationInput({
      email: 'not-an-email',
      password,
    });

    expect(result).toEqual({
      errors: {
        email: 'Enter a valid email address.',
        password: 'Use between 15 and 128 characters.',
      },
      ok: false,
    });
    expect(JSON.stringify(result)).not.toContain(password);
  });

  it('enforces NFC and the UTF-8 byte ceiling before calling Nest', () => {
    expect(
      validateRegistrationInput({
        email: 'brewer@example.com',
        password: `${'a'.repeat(14)}e\u0301`,
      }),
    ).toMatchObject({
      errors: { password: 'Use a password in its normal composed form.' },
      ok: false,
    });

    expect(
      validateRegistrationInput({
        email: 'brewer@example.com',
        password: '😀'.repeat(129),
      }),
    ).toMatchObject({
      errors: { password: 'Use between 15 and 128 characters.' },
      ok: false,
    });
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
