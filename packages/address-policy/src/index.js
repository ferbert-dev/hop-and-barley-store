// Postal formats only: this does not establish that an address exists.
// Sources and exceptions are documented in ../README.md.
const fourDigits = { pattern: '[0-9]{4}', example: '1234', required: true };
const fiveDigits = { pattern: '[0-9]{5}', example: '12345', required: true };
const spacedFive = {
  pattern: '[0-9]{3} ?[0-9]{2}',
  example: '123 45',
  required: true,
};
const policies = {
  AT: fourDigits,
  BE: fourDigits,
  BG: fourDigits,
  HR: { pattern: '([Hh][Rr]-)?[0-9]{5}', example: '10000', required: true },
  CY: { pattern: '([Cc][Yy]-)?[0-9]{4}', example: '1000', required: true },
  CZ: spacedFive,
  DK: fourDigits,
  EE: fiveDigits,
  FI: fiveDigits,
  FR: fiveDigits,
  DE: fiveDigits,
  GR: spacedFive,
  HU: fourDigits,
  IE: {
    pattern: '([A-Za-z][0-9]{2}|[Dd]6[Ww]) ?[A-Za-z0-9]{4}',
    example: 'D02 X285',
    required: false,
  },
  IT: fiveDigits,
  LV: { pattern: '([Ll][Vv]-)?[0-9]{4}', example: 'LV-1050', required: true },
  LT: { pattern: '([Ll][Tt]-)?[0-9]{5}', example: 'LT-01100', required: true },
  LU: { pattern: '([Ll]-)?[0-9]{4}', example: 'L-1234', required: true },
  // UPU documents personal postcodes outside Malta's usual AAA 1234 format.
  MT: {
    pattern: '[\\s\\S]*\\S[\\s\\S]*',
    example: 'VLT 1117 (or a personal postcode)',
    required: true,
  },
  NL: { pattern: '[0-9]{4} ?[A-Za-z]{2}', example: '1234 AB', required: true },
  PL: { pattern: '[0-9]{2}-?[0-9]{3}', example: '00-001', required: true },
  PT: { pattern: '[0-9]{4}-?[0-9]{3}', example: '1000-001', required: true },
  RO: { pattern: '[0-9]{6}', example: '010011', required: true },
  SK: spacedFive,
  SI: fourDigits,
  ES: fiveDigits,
  SE: spacedFive,
};
const fallback = Object.freeze({ required: false });
const us = Object.freeze({
  pattern: '[0-9]{5}(-[0-9]{4})?',
  example: '97205',
  required: true,
});
for (const policy of Object.values(policies)) Object.freeze(policy);
Object.freeze(policies);

function getPostalCodePolicy(countryCode) {
  const country = countryCode.trim().toUpperCase();
  return Object.hasOwn(policies, country)
    ? policies[country]
    : country === 'US'
      ? us
      : fallback;
}

function normalizePostalCode(countryCode, value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const country =
    typeof countryCode === 'string' ? countryCode.trim().toUpperCase() : '';
  return Object.hasOwn(policies, country) ? trimmed.toUpperCase() : trimmed;
}

function isValidPostalCode(countryCode, value) {
  const policy = getPostalCodePolicy(
    typeof countryCode === 'string' ? countryCode : '',
  );
  if (value === undefined) return !policy.required;
  if (typeof value !== 'string' || value.length === 0 || value.length > 32)
    return false;
  return !policy.pattern || new RegExp(`^(?:${policy.pattern})$`).test(value);
}

exports.getPostalCodePolicy = getPostalCodePolicy;
exports.normalizePostalCode = normalizePostalCode;
exports.isValidPostalCode = isValidPostalCode;
