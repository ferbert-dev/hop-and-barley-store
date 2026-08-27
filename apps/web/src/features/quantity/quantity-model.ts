import type { components } from '@hop-and-barley/api-client';

type ProductQuantityFields = Pick<
  components['schemas']['ProductDto'],
  | 'amountUnit'
  | 'kitYieldVolumeMl'
  | 'maximumOrderAmount'
  | 'minimumOrderAmount'
  | 'orderStepAmount'
  | 'packageNetWeightMg'
  | 'priceBasisAmount'
  | 'saleKind'
>;

export type SaleKind = ProductQuantityFields['saleKind'];
export type AmountUnit = ProductQuantityFields['amountUnit'];
export type QuantityMetadata = Readonly<ProductQuantityFields>;

const MILLIGRAMS_PER_GRAM = 1_000;
const MILLIGRAMS_PER_KILOGRAM = 1_000_000;

export function readQuantityMetadata(value: unknown): QuantityMetadata | null {
  if (!isRecord(value)) return null;

  const metadata = {
    amountUnit: value.amountUnit,
    kitYieldVolumeMl: value.kitYieldVolumeMl,
    maximumOrderAmount: value.maximumOrderAmount,
    minimumOrderAmount: value.minimumOrderAmount,
    orderStepAmount: value.orderStepAmount,
    packageNetWeightMg: value.packageNetWeightMg,
    priceBasisAmount: value.priceBasisAmount,
    saleKind: value.saleKind,
  };

  if (
    !isSaleKind(metadata.saleKind) ||
    !isAmountUnit(metadata.amountUnit) ||
    !isPositiveSafeInteger(metadata.priceBasisAmount) ||
    !isPositiveSafeInteger(metadata.minimumOrderAmount) ||
    !isPositiveSafeInteger(metadata.orderStepAmount) ||
    !isNullablePositiveSafeInteger(metadata.maximumOrderAmount) ||
    !isNullablePositiveSafeInteger(metadata.packageNetWeightMg) ||
    !isNullablePositiveSafeInteger(metadata.kitYieldVolumeMl) ||
    (metadata.saleKind === 'WEIGHT' && metadata.amountUnit !== 'MILLIGRAM') ||
    (metadata.saleKind !== 'WEIGHT' && metadata.amountUnit !== 'EACH') ||
    (metadata.saleKind !== 'PACKAGE' && metadata.packageNetWeightMg !== null) ||
    (metadata.saleKind !== 'KIT' && metadata.kitYieldVolumeMl !== null) ||
    (metadata.maximumOrderAmount !== null &&
      metadata.maximumOrderAmount < metadata.minimumOrderAmount)
  ) {
    return null;
  }

  // Every field was validated above; keep the only structural boundary inside
  // this parser rather than spreading unchecked API values through the UI.
  return metadata as QuantityMetadata;
}

export function validateOrderAmount(
  amount: number,
  metadata: QuantityMetadata,
): string | null {
  if (!isPositiveSafeInteger(amount)) return 'Enter a whole valid amount.';
  if (metadata.saleKind === 'WEIGHT') {
    const minimumWeightAmount = 100_000;
    const maximumWeightAmount = Math.min(
      metadata.maximumOrderAmount ?? 100_000_000,
      100_000_000,
    );
    if (amount < minimumWeightAmount) {
      return 'Minimum order amount is 100g.';
    }
    if (amount > maximumWeightAmount) {
      return `Maximum order amount is ${formatWeightAmount(maximumWeightAmount)}.`;
    }
    if (amount % minimumWeightAmount !== 0) {
      return 'Choose increments of 100g.';
    }
    return null;
  }
  if (amount < metadata.minimumOrderAmount) {
    return `Minimum order amount is ${formatAmount(metadata.minimumOrderAmount, metadata)}.`;
  }
  if (
    metadata.maximumOrderAmount !== null &&
    amount > metadata.maximumOrderAmount
  ) {
    return `Maximum order amount is ${formatAmount(metadata.maximumOrderAmount, metadata)}.`;
  }
  if ((amount - metadata.minimumOrderAmount) % metadata.orderStepAmount !== 0) {
    return `Choose increments of ${formatAmount(metadata.orderStepAmount, metadata)}.`;
  }
  return null;
}

export function parseWeightInput(input: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,6}))?$/u.exec(input.trim());
  if (!match) return null;

  const [, wholeDigits, fractionDigits = ''] = match;
  const scale = 10 ** fractionDigits.length;
  const whole = Number(wholeDigits);
  const fraction = fractionDigits === '' ? 0 : Number(fractionDigits);
  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction))
    return null;

  const fractionalMilligrams = (fraction * MILLIGRAMS_PER_KILOGRAM) / scale;
  if (!Number.isSafeInteger(fractionalMilligrams)) return null;

  const amount = whole * MILLIGRAMS_PER_KILOGRAM + fractionalMilligrams;
  return Number.isSafeInteger(amount) && amount > 0 ? amount : null;
}

export function formatAmount(
  amount: number,
  metadata: Pick<
    QuantityMetadata,
    'kitYieldVolumeMl' | 'packageNetWeightMg' | 'saleKind'
  >,
): string {
  if (!isPositiveSafeInteger(amount)) return 'Invalid amount';

  if (metadata.saleKind === 'WEIGHT') return formatWeightAmount(amount);

  if (metadata.saleKind === 'PACKAGE') {
    const packLabel = `${String(amount)} ${amount === 1 ? 'pack' : 'packs'}`;
    const detail = formatAggregateProductDetail(amount, metadata);
    return detail === null ? packLabel : `${packLabel} · ${detail}`;
  }

  const kitLabel = `${String(amount)} ${amount === 1 ? 'kit' : 'kits'}`;
  const detail = formatAggregateProductDetail(amount, metadata);
  return detail === null ? kitLabel : `${kitLabel} · ${detail}`;
}

export function formatAggregateProductDetail(
  amount: number,
  metadata: Pick<
    QuantityMetadata,
    'kitYieldVolumeMl' | 'packageNetWeightMg' | 'saleKind'
  >,
): string | null {
  if (!isPositiveSafeInteger(amount)) return null;

  if (metadata.saleKind === 'PACKAGE' && metadata.packageNetWeightMg !== null) {
    return `${formatWeightAmount(amount * metadata.packageNetWeightMg)} total net`;
  }

  if (metadata.saleKind !== 'KIT' || metadata.kitYieldVolumeMl === null) {
    return null;
  }

  const totalYieldMl = amount * metadata.kitYieldVolumeMl;
  return `${formatGallons(totalYieldMl)} / approx. ${formatVolumeMl(totalYieldMl)} total yield`;
}

export function formatSaleUnit(metadata: QuantityMetadata): string {
  if (metadata.saleKind === 'WEIGHT') {
    return `per ${formatWeightAmount(metadata.priceBasisAmount)}`;
  }
  return metadata.saleKind === 'PACKAGE' ? 'per pack' : 'per kit';
}

export function formatPackageNetWeight(
  metadata: QuantityMetadata,
): string | null {
  if (metadata.saleKind !== 'PACKAGE' || metadata.packageNetWeightMg === null) {
    return null;
  }
  return `${formatWeightAmount(metadata.packageNetWeightMg)} net each`;
}

export function formatWeightInput(amount: number): string {
  return formatDecimal(amount, MILLIGRAMS_PER_KILOGRAM);
}

export function estimateLineTotalMinor(
  priceMinor: number,
  amount: number,
  metadata: QuantityMetadata,
): number | null {
  if (!isNonNegativeSafeInteger(priceMinor) || !isPositiveSafeInteger(amount)) {
    return null;
  }

  const basis = BigInt(metadata.priceBasisAmount);
  const product = BigInt(priceMinor) * BigInt(amount);
  const rounded = (BigInt(2) * product + basis) / (BigInt(2) * basis);
  return rounded <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(rounded) : null;
}

function formatWeightAmount(amountMg: number): string {
  if (amountMg >= MILLIGRAMS_PER_KILOGRAM) {
    return `${formatDecimal(amountMg, MILLIGRAMS_PER_KILOGRAM)}kg`;
  }
  return `${formatDecimal(amountMg, MILLIGRAMS_PER_GRAM)}g`;
}

function formatVolumeMl(volumeMl: number): string {
  if (!isPositiveSafeInteger(volumeMl)) return 'unavailable';
  return `${String(Math.round(volumeMl / 1_000))} L`;
}

function formatGallons(volumeMl: number): string {
  // One US liquid gallon is exactly 3.785411784 litres (3,785.411784 ml).
  // This integer ratio keeps the display deterministic without another package.
  const gallonNumerator = BigInt(volumeMl) * BigInt(125_000);
  const gallonDenominator = BigInt(473_176_473);
  const gallons =
    (BigInt(2) * gallonNumerator + gallonDenominator) /
    (BigInt(2) * gallonDenominator);
  return `${gallons.toString()} gal`;
}

function formatDecimal(value: number, divisor: number): string {
  const whole = Math.floor(value / divisor);
  const remainder = value % divisor;
  if (remainder === 0) return String(whole);
  return `${String(whole)}.${String(remainder)
    .padStart(String(divisor - 1).length, '0')
    .replace(/0+$/u, '')}`;
}

function isSaleKind(value: unknown): value is SaleKind {
  return value === 'WEIGHT' || value === 'PACKAGE' || value === 'KIT';
}

function isAmountUnit(value: unknown): value is AmountUnit {
  return value === 'MILLIGRAM' || value === 'EACH';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function isNullablePositiveSafeInteger(value: unknown): value is number | null {
  return value === null || isPositiveSafeInteger(value);
}
