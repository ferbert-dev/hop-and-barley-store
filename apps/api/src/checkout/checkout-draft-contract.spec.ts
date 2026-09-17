import { BadRequestException } from '@nestjs/common';
import { createAppValidationPipe } from '../app-validation';
import { CheckoutPaymentMethod } from '../orders/dto/create-order.dto';
import { SaveCheckoutDraftDto } from './dto/checkout-draft.dto';

const base = {
  delivery: {
    city: 'دبي',
    countryCode: 'ae',
    street: 'شارع الشيخ زايد',
  },
  email: ' ADA@Example.COM ',
  fullName: ' آدا برور ',
  paymentMethod: CheckoutPaymentMethod.STRIPE_DEBIT_CARD,
  phoneNumber: ' +971 50 123 4567 ',
};

describe('O2G checkout draft contract', () => {
  const pipe = createAppValidationPipe();

  it('accepts international Unicode and keeps AE postal data optional', async () => {
    await expect(validate(base)).resolves.toMatchObject({
      delivery: {
        city: 'دبي',
        countryCode: 'AE',
        street: 'شارع الشيخ زايد',
      },
      email: 'ada@example.com',
      fullName: 'آدا برور',
      phoneNumber: '+971 50 123 4567',
    });
  });

  it('requires a five-digit German postal code', async () => {
    await expect(
      validate({
        ...base,
        delivery: { ...base.delivery, countryCode: 'DE' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate({
        ...base,
        delivery: {
          ...base.delivery,
          city: 'München',
          countryCode: 'DE',
          postalCode: '80331',
          street: 'Türkenstraße',
        },
      }),
    ).resolves.toMatchObject({
      delivery: { countryCode: 'DE', postalCode: '80331' },
    });
  });

  it('requires a US ZIP and two-letter administrative area', async () => {
    await expect(
      validate({
        ...base,
        delivery: { ...base.delivery, countryCode: 'US' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate({
        ...base,
        delivery: {
          ...base.delivery,
          administrativeArea: 'or',
          countryCode: 'US',
          postalCode: '97205-1234',
        },
      }),
    ).resolves.toMatchObject({
      delivery: {
        administrativeArea: 'or',
        countryCode: 'US',
        postalCode: '97205-1234',
      },
    });
  });

  it.each([
    ['ES', '08001'],
    ['FR', '75001'],
    ['AT', '1010'],
    ['BE', '1000'],
    ['BG', '1000'],
    ['HR', '10000'],
    ['CY', '1000'],
    ['CZ', '110 00'],
    ['DK', '1000'],
    ['EE', '10111'],
    ['FI', '00100'],
    ['GR', '105 58'],
    ['HU', '1011'],
    ['IT', '00118'],
    ['LV', 'LV-1050'],
    ['LT', 'LT-01100'],
    ['LU', 'L-1234'],
    ['NL', '1012 AB'],
    ['PL', '00-001'],
    ['PT', '1000-001'],
    ['RO', '010011'],
    ['SK', '811 01'],
    ['SI', '1000'],
    ['SE', '111 22'],
  ])(
    'enforces %s postal format through the request validation pipe',
    async (countryCode, postalCode) => {
      const delivery = { ...base.delivery, countryCode, postalCode };
      await expect(validate({ ...base, delivery })).resolves.toMatchObject({
        delivery: { postalCode },
      });
      for (const invalid of [undefined, '!', null]) {
        await expect(
          validate({ ...base, delivery: { ...delivery, postalCode: invalid } }),
        ).rejects.toBeInstanceOf(BadRequestException);
      }
    },
  );

  it('normalizes EU codes, permits optional Irish codes and personal Maltese codes', async () => {
    for (const [countryCode, input, expected] of [
      ['nl', ' 1012 ab ', '1012 AB'],
      ['IE', ' ', undefined],
      ['IE', ' d6w f2t4 ', 'D6W F2T4'],
      ['MT', 'PERSONAL', 'PERSONAL'],
    ]) {
      await expect(
        validate({
          ...base,
          delivery: { ...base.delivery, countryCode, postalCode: input },
        }),
      ).resolves.toMatchObject({ delivery: { postalCode: expected } });
    }
  });

  it.each(['GB', 'CH', 'NO', 'HK'])(
    'does not introduce postal restrictions outside the EU (%s)',
    async (countryCode) => {
      await expect(
        validate({ ...base, delivery: { ...base.delivery, countryCode } }),
      ).resolves.toMatchObject({ delivery: { countryCode } });
    },
  );

  it('rejects unassigned country codes and client-owned internal fields', async () => {
    await expect(
      validate({
        ...base,
        delivery: { ...base.delivery, countryCode: 'ZZ' },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      validate({ ...base, guestCapabilityDigest: 'secret' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  function validate(value: unknown) {
    return pipe.transform(value, {
      data: '',
      metatype: SaveCheckoutDraftDto,
      type: 'body',
    });
  }
});
