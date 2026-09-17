export type PostalCodePolicy = Readonly<{
  pattern?: string;
  example?: string;
  required: boolean;
}>;
export function getPostalCodePolicy(countryCode: string): PostalCodePolicy;
export function normalizePostalCode(
  countryCode: unknown,
  value: unknown,
): unknown;
export function isValidPostalCode(
  countryCode: unknown,
  value: unknown,
): boolean;
