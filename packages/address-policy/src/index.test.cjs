const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  getPostalCodePolicy,
  isValidPostalCode,
  normalizePostalCode,
} = require('./index.js');
const examples = {
  AT: '1010',
  BE: '1000',
  BG: '1000',
  HR: '10000',
  CY: '1000',
  CZ: '110 00',
  DK: '1000',
  EE: '10111',
  FI: '00100',
  FR: '75001',
  DE: '10115',
  GR: '105 58',
  HU: '1011',
  IE: 'D6W F2T4',
  IT: '00118',
  LV: 'LV-1050',
  LT: 'LT-01100',
  LU: 'L-1234',
  MT: 'VLT 1117',
  NL: '1012 AB',
  PL: '00-001',
  PT: '1000-001',
  RO: '010011',
  SK: '811 01',
  SI: '1000',
  ES: '08001',
  SE: '111 22',
};
for (const [country, value] of Object.entries(examples)) {
  test(`${country}: accepted example, missing code and invalid format`, () => {
    assert.equal(isValidPostalCode(country, value), true);
    assert.equal(isValidPostalCode(country, undefined), country === 'IE');
    if (country !== 'MT') assert.equal(isValidPostalCode(country, '!'), false);
    assert.equal(isValidPostalCode(country, null), false);
    assert.equal(isValidPostalCode(country, '1'.repeat(33)), false);
  });
}
test('normalization preserves leading zeroes and supports optional empty Eircode', () => {
  assert.equal(normalizePostalCode('nl', ' 1012 ab '), '1012 AB');
  assert.equal(normalizePostalCode('FI', ' 00100 '), '00100');
  assert.equal(isValidPostalCode('IE', normalizePostalCode('IE', ' ')), true);
  assert.equal(isValidPostalCode('IE', 'D02 X285'), true);
  assert.equal(isValidPostalCode('IE', 'D6W F2T4'), true);
});
test('non-EU rules remain unchanged, including US and no-postcode countries', () => {
  for (const country of ['GB', 'CH', 'NO', 'IS', 'AE', 'HK']) {
    assert.equal(getPostalCodePolicy(country).required, false);
    assert.equal(isValidPostalCode(country, undefined), true);
    assert.equal(isValidPostalCode(country, 'local postal text'), true);
  }
  assert.equal(isValidPostalCode('US', undefined), false);
  assert.equal(isValidPostalCode('US', '97205-1234'), true);
  assert.equal(isValidPostalCode('US', '972051234'), false);
});
test('personal Maltese codes remain supported; policy lookups ignore prototype keys', () => {
  assert.equal(isValidPostalCode('MT', 'PERSONAL'), true);
  assert.equal(isValidPostalCode('MT', '   '), false);
  assert.equal(getPostalCodePolicy('constructor').required, false);
  assert.equal(Object.isFrozen(getPostalCodePolicy('ES')), true);
});
