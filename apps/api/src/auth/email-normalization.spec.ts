import { canonicalizeRegistrationEmail } from './email-normalization';

describe('canonicalizeRegistrationEmail', () => {
  it('preserves the NFC display form and canonicalizes the login identity', () => {
    expect(
      canonicalizeRegistrationEmail('BrEw.Master+Tap@BÜCHER.Example'),
    ).toEqual({
      email: 'BrEw.Master+Tap@BÜCHER.Example',
      normalizedEmail: 'brew.master+tap@xn--bcher-kva.example',
    });
    expect(
      canonicalizeRegistrationEmail('brew.master+tap@gmail.com'),
    ).not.toEqual(canonicalizeRegistrationEmail('brewmaster@gmail.com'));
  });

  it('normalizes the display domain to NFC without trimming input', () => {
    expect(canonicalizeRegistrationEmail('Cafe@Bu\u0308cher.Example')).toEqual({
      email: 'Cafe@Bücher.Example',
      normalizedEmail: 'cafe@xn--bcher-kva.example',
    });
  });

  it.each([
    'café@example.com',
    'cafe\u0301@example.com',
    '.brew@example.com',
    'brew..master@example.com',
    'brew@example',
    'brew@-example.com',
    'brew@example.com.',
    ' brew@example.com',
    'brew@example.com ',
    'brew@@example.com',
  ])('rejects unsupported or malformed identity %p', (email) => {
    expect(() => canonicalizeRegistrationEmail(email)).toThrow(
      'Invalid registration input.',
    );
  });
});
