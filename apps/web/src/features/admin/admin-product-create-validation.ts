export type AdminProductSaleKind = 'PACKAGE' | 'WEIGHT';

export type AdminProductCreateInput = Readonly<{
  activeFrom: string;
  activeUntil: string;
  categoryId: string;
  description: string;
  image: File | null;
  isActive: boolean;
  name: string;
  packageNetWeightGrams: string;
  price: string;
  saleKind: AdminProductSaleKind;
  stock: string;
}>;

export type AdminProductCreatePayload = Readonly<{
  activeFrom?: string;
  activeUntil?: string;
  categoryId: string;
  description: string;
  image: File;
  isActive: boolean;
  name: string;
  packageNetWeightMg?: number;
  price: string;
  saleKind: AdminProductSaleKind;
  stockAmount: number;
}>;

export type AdminProductCreateValidation =
  | Readonly<{ errors: Record<string, string>; ok: false }>
  | Readonly<{ ok: true; value: AdminProductCreatePayload }>;

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const MONEY = /^(?:0|[1-9]\d*)(?:[.]\d{1,2})?$/u;
const MAX_PRICE_MINOR = 2_147_483_647;
const WHOLE_NUMBER = /^(?:0|[1-9]\d*)$/u;

export function validateAdminProductCreate(
  input: AdminProductCreateInput,
): AdminProductCreateValidation {
  const errors: Record<string, string> = {};
  const name = input.name.trim();
  const description = input.description.trim();
  const price = input.price.trim();

  if (name.length < 2 || name.length > 160) {
    errors.name = 'Enter a product title between 2 and 160 characters.';
  }
  if (description.length < 2 || description.length > 4_000) {
    errors.description = 'Enter a description between 2 and 4,000 characters.';
  }
  const priceMinor = MONEY.test(price) ? decimalToMinor(price) : null;
  if (
    priceMinor === null ||
    !Number.isSafeInteger(priceMinor) ||
    priceMinor <= 0 ||
    priceMinor > MAX_PRICE_MINOR
  ) {
    errors.price = 'Enter a price between 0.01 and 21,474,836.47.';
  }
  if (!UUID.test(input.categoryId)) {
    errors.categoryId = 'Choose a product type.';
  }
  if (input.saleKind !== 'WEIGHT' && input.saleKind !== 'PACKAGE') {
    errors.saleKind = 'Choose how this product is sold.';
  }

  const stockAmount =
    input.saleKind === 'WEIGHT'
      ? kilogramsToMilligrams(input.stock)
      : packageCount(input.stock);
  if (stockAmount === null) {
    errors.stock =
      input.saleKind === 'WEIGHT'
        ? 'Enter stock in 0.1 kg steps.'
        : 'Enter a whole number of packages.';
  }

  const packageNetWeightMg =
    input.saleKind === 'PACKAGE'
      ? gramsToMilligrams(input.packageNetWeightGrams)
      : undefined;
  if (input.saleKind === 'PACKAGE' && packageNetWeightMg === null) {
    errors.packageNetWeightGrams =
      'Enter a positive package net weight in grams, or leave it empty.';
  }

  const activeFrom = toIsoDate(input.activeFrom);
  const activeUntil = input.activeUntil.trim()
    ? toIsoDate(input.activeUntil)
    : undefined;
  if (input.activeFrom.trim() && !activeFrom) {
    errors.activeFrom = 'Enter a valid start date and time.';
  }
  if (input.activeUntil.trim() && !activeUntil) {
    errors.activeUntil = 'Enter a valid end date and time.';
  }
  if (activeFrom && activeUntil && activeUntil <= activeFrom) {
    errors.activeUntil = 'The end date must be after the start date.';
  }

  if (!input.image) {
    errors.image = 'Choose a JPEG, PNG, or WebP image.';
  } else if (!ALLOWED_IMAGE_TYPES.has(input.image.type)) {
    errors.image = 'Use a JPEG, PNG, or WebP image.';
  } else if (
    input.image.size === 0 ||
    input.image.size > MAX_IMAGE_SIZE_BYTES
  ) {
    errors.image = 'The image must be no larger than 5 MiB.';
  }

  if (
    Object.keys(errors).length > 0 ||
    stockAmount === null ||
    !input.image ||
    packageNetWeightMg === null
  ) {
    return { errors, ok: false };
  }

  return {
    ok: true,
    value: {
      ...(activeFrom ? { activeFrom } : {}),
      ...(activeUntil ? { activeUntil } : {}),
      categoryId: input.categoryId,
      description,
      image: input.image,
      isActive: input.isActive,
      name,
      ...(packageNetWeightMg === undefined ? {} : { packageNetWeightMg }),
      price: normalizeMoney(price),
      saleKind: input.saleKind,
      stockAmount,
    },
  };
}

function kilogramsToMilligrams(value: string): number | null {
  const trimmed = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:[.]\d)?$/u.test(trimmed)) return null;
  const [whole, fraction = '0'] = trimmed.split('.');
  return boundedNumber(Number(whole) * 1_000_000 + Number(fraction) * 100_000);
}

function packageCount(value: string): number | null {
  const trimmed = value.trim();
  return WHOLE_NUMBER.test(trimmed) ? boundedNumber(Number(trimmed)) : null;
}

function gramsToMilligrams(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^(?:0|[1-9]\d*)(?:[.]\d{1,3})?$/u.test(trimmed)) return null;
  const [whole, fraction = ''] = trimmed.split('.');
  const fractionMg = `${fraction}000`.slice(0, 3);
  const result = boundedNumber(Number(whole) * 1_000 + Number(fractionMg));
  return result && result > 0 ? result : null;
}

function boundedNumber(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 && value <= 2_000_000_000
    ? value
    : null;
}

function decimalToMinor(value: string): number {
  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(`${fraction}00`.slice(0, 2));
}

function normalizeMoney(value: string): string {
  const [whole, fraction = ''] = value.split('.');
  return `${whole}.${`${fraction}00`.slice(0, 2)}`;
}

function toIsoDate(value: string): string | undefined {
  if (!value.trim()) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export function initialLocalDateTime(now = new Date()): string {
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 16);
}
