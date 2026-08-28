import { normalizeRegistrationPassword } from './password-policy';

describe('registration password policy', () => {
  it('accepts exactly 12 total characters when all categories are present', () => {
    expect(normalizeRegistrationPassword('Abcdefghi1!x')).toBe('Abcdefghi1!x');
  });

  it('normalizes to NFC before applying the shared policy', () => {
    expect(normalizeRegistrationPassword('Cafe\u0301Strong1!')).toBe(
      'CaféStrong1!',
    );
  });

  it('rejects when NFC normalization reduces the password below 12 characters', () => {
    expect(() => normalizeRegistrationPassword('A\u0301bcdefg1!xy')).toThrow(
      'Invalid registration input.',
    );
  });

  it('rejects control characters', () => {
    const unsafeControlInput = [
      'Abcd',
      'efgh',
      '1!',
      String.fromCodePoint(0),
      'x',
    ].join('');
    expect(() => normalizeRegistrationPassword(unsafeControlInput)).toThrow(
      'Invalid registration input.',
    );
  });

  it.each([
    ['fewer than 12 total characters', 'Abcdefg1!x'],
    ['no lowercase letter', 'ABCDEFGHI1!X'],
    ['no uppercase letter', 'abcdefghi1!x'],
    ['no digit', 'Abcdefghij!x'],
    ['no special character', 'Abcdefghi12x'],
  ])('rejects %s without echoing the password', (_case, password) => {
    expect(() => normalizeRegistrationPassword(password)).toThrow(
      'Invalid registration input.',
    );
  });

  it('does not impose the former blocklist or maximum length rules', () => {
    expect(normalizeRegistrationPassword('Password123!')).toBe('Password123!');
    const longPassword = `A1!${'a'.repeat(200)}`;
    expect(normalizeRegistrationPassword(longPassword)).toBe(longPassword);
  });
});
