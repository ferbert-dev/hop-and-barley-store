export interface PriceValue {
  currency: string;
  locale?: string;
  minorUnits: number;
}

const exactDecimalProbe = '90071992547409.91';

/**
 * ECMA-402 accepts an exact decimal string here, but TypeScript's current
 * Intl overload exposes only number and bigint inputs.
 */
function asIntlDecimalInput(value: string): number {
  return value as unknown as number;
}

function runtimeSupportsExactDecimalStrings(): boolean {
  try {
    const exactParts = new Intl.NumberFormat('en-US', {
      maximumFractionDigits: 2,
      minimumFractionDigits: 2,
      useGrouping: false,
    }).formatToParts(asIntlDecimalInput(exactDecimalProbe));
    const reconstructed = exactParts
      .filter(({ type }) =>
        ['integer', 'decimal', 'fraction', 'minusSign'].includes(type),
      )
      .map(({ value }) => value)
      .join('');

    return reconstructed === exactDecimalProbe;
  } catch {
    return false;
  }
}

const supportsExactDecimalStrings = runtimeSupportsExactDecimalStrings();

function minorUnitsToDecimalString(
  minorUnits: number,
  fractionDigits: number,
): string {
  const value = BigInt(minorUnits);
  const negative = value < BigInt(0);
  const digits = (negative ? -value : value)
    .toString()
    .padStart(fractionDigits + 1, '0');

  if (fractionDigits === 0) {
    return `${negative ? '-' : ''}${digits}`;
  }

  const fractionStart = digits.length - fractionDigits;

  return `${negative ? '-' : ''}${digits.slice(0, fractionStart)}.${digits.slice(fractionStart)}`;
}

export function formatPrice(value: PriceValue): string;
export function formatPrice(minorUnits: number, currency: string): string;
export function formatPrice(
  valueOrMinorUnits: PriceValue | number,
  legacyCurrency?: string,
): string {
  const {
    currency,
    locale = 'en-GB',
    minorUnits,
  } = typeof valueOrMinorUnits === 'number'
    ? { currency: legacyCurrency ?? '', minorUnits: valueOrMinorUnits }
    : valueOrMinorUnits;

  if (!Number.isSafeInteger(minorUnits)) {
    throw new RangeError('Price minorUnits must be a safe integer.');
  }

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new RangeError('Price currency must be an uppercase ISO 4217 code.');
  }

  if (!supportsExactDecimalStrings) {
    throw new RangeError(
      'This runtime cannot format exact decimal strings safely.',
    );
  }

  const formatter = new Intl.NumberFormat(locale, {
    currency,
    style: 'currency',
  });
  const { maximumFractionDigits, minimumFractionDigits } =
    formatter.resolvedOptions();

  if (
    maximumFractionDigits === undefined ||
    minimumFractionDigits === undefined ||
    maximumFractionDigits !== minimumFractionDigits
  ) {
    throw new RangeError(
      'The currency formatter did not resolve to a fixed minor-unit scale.',
    );
  }

  const decimalValue = minorUnitsToDecimalString(
    minorUnits,
    maximumFractionDigits,
  );

  return formatter.format(asIntlDecimalInput(decimalValue));
}
