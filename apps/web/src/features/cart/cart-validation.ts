export type CartContactInput = Readonly<{
  city: string;
  fullName: string;
  phone: string;
  shippingAddress: string;
}>;

export type CartContactErrors = Partial<Record<keyof CartContactInput, string>>;

export type CartContactValidation =
  | Readonly<{ errors: CartContactErrors; ok: false }>
  | Readonly<{ ok: true; value: CartContactInput }>;

const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/u;

export function validateCartContact(
  input: CartContactInput,
): CartContactValidation {
  const value = {
    city: input.city.trim(),
    fullName: input.fullName.trim(),
    phone: input.phone.trim(),
    shippingAddress: input.shippingAddress.trim(),
  };
  const errors: CartContactErrors = {};

  if (
    value.fullName.length < 2 ||
    value.fullName.length > 120 ||
    hasControl(value.fullName)
  ) {
    errors.fullName = 'Enter your full name.';
  }
  if (!/^[+()\- 0-9]{7,32}$/u.test(value.phone)) {
    errors.phone = 'Enter a valid phone number.';
  }
  if (
    value.city.length < 2 ||
    value.city.length > 120 ||
    hasControl(value.city)
  ) {
    errors.city = 'Enter your city.';
  }
  if (
    value.shippingAddress.length < 5 ||
    value.shippingAddress.length > 320 ||
    hasControl(value.shippingAddress)
  ) {
    errors.shippingAddress = 'Enter your shipping address.';
  }

  return Object.keys(errors).length > 0
    ? { errors, ok: false }
    : { ok: true, value };
}

function hasControl(value: string) {
  return CONTROL_CHARACTER.test(value);
}
