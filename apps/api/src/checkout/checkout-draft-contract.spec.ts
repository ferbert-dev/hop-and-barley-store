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
