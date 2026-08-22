import {
  loadCommonPasswordBlocklist,
  normalizeRegistrationPassword,
  PINNED_BLOCKLIST_SHA256,
} from './password-policy';

describe('registration password policy', () => {
  it('ships the pinned, exact 10k SecLists snapshot', () => {
    const blocklist = loadCommonPasswordBlocklist();

    expect(blocklist.size).toBe(10_000);
    expect(PINNED_BLOCKLIST_SHA256).toBe(
      '4adb3f0afb4a10cf19ebe48d8c69a46f934bbc8d77c694c210564f9583e7f4ba',
    );
    expect(blocklist.has('password')).toBe(true);
    expect(blocklist.has('123456789')).toBe(true);
  });

  it('returns the NFC form and measures Unicode code points', () => {
    expect(normalizeRegistrationPassword('Cafe\u0301-Long-Passphrase')).toBe(
      'Café-Long-Passphrase',
    );
    expect(normalizeRegistrationPassword('🫙'.repeat(15))).toBe(
      '🫙'.repeat(15),
    );
  });

  it.each([
    'short-password',
    'a'.repeat(129),
    `${'valid-long-password'}\n`,
    'password',
    'PASSWORD',
  ])('rejects password-policy violation without echoing %p', (password) => {
    expect(() => normalizeRegistrationPassword(password)).toThrow(
      'Invalid registration input.',
    );
  });
});
