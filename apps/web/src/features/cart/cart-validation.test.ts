import { describe, expect, it } from 'vitest';

import { validateCartContact } from './cart-validation';

describe('cart contact presentation validation', () => {
  it('accepts the reference contact and shipping fields without retaining checkout intent', () => {
    expect(
      validateCartContact({
        city: ' Madrid ',
        fullName: ' Ada Brewer ',
        phone: '+34 600 123 456',
        shippingAddress: ' Calle de la Malta 12 ',
      }),
    ).toEqual({
      ok: true,
      value: {
        city: 'Madrid',
        fullName: 'Ada Brewer',
        phone: '+34 600 123 456',
        shippingAddress: 'Calle de la Malta 12',
      },
    });
  });

  it('returns field-only errors for incomplete shipping details', () => {
    expect(
      validateCartContact({
        city: '',
        fullName: '',
        phone: 'x',
        shippingAddress: '',
      }),
    ).toEqual({
      errors: {
        city: 'Enter your city.',
        fullName: 'Enter your full name.',
        phone: 'Enter a valid phone number.',
        shippingAddress: 'Enter your shipping address.',
      },
      ok: false,
    });
  });
});
