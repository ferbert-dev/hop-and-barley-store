import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AdminCatalogQueryDto, CatalogQueryDto } from './catalog-query.dto';

async function validateQuery(query: Record<string, unknown>) {
  const value = plainToInstance(CatalogQueryDto, query);
  const errors = await validate(value, {
    forbidNonWhitelisted: true,
    whitelist: true,
  });

  return { errors, value };
}

describe('CatalogQueryDto', () => {
  it('applies stable defaults and omits blank search', async () => {
    const defaults = await validateQuery({});
    const blankSearch = await validateQuery({ search: '   ' });

    expect(defaults.errors).toEqual([]);
    expect(defaults.value).toMatchObject({
      limit: 12,
      page: 1,
      sort: 'name-asc',
    });
    expect(blankSearch.errors).toEqual([]);
    expect(blankSearch.value.search).toBeUndefined();
  });

  it('normalizes search with Unicode NFC, trim and space collapse', async () => {
    const { errors, value } = await validateQuery({
      search: '  Cafe\u0301   roasted\u00a0malt  ',
    });

    expect(errors).toEqual([]);
    expect(value.search).toBe('Café roasted malt');
  });

  it('keeps fullwidth percent and underscore as literal NFC search text', async () => {
    const { errors, value } = await validateQuery({ search: 'ab％cd＿ef' });

    expect(errors).toEqual([]);
    expect(value.search).toBe('ab％cd＿ef');
  });

  it('accepts every bounded filter at its public edge', async () => {
    const { errors, value } = await validateQuery({
      category: ['hop-pellets-2', 'malts'],
      limit: '48',
      maxPriceMinor: '2147483647',
      minPriceMinor: '0',
      page: '200',
      search: 'ab',
      sort: 'price-desc',
    });

    expect(errors).toEqual([]);
    expect(value).toMatchObject({
      category: ['hop-pellets-2', 'malts'],
      limit: 48,
      maxPriceMinor: 2147483647,
      minPriceMinor: 0,
      page: 200,
      search: 'ab',
      sort: 'price-desc',
    });
  });

  it.each([
    ['one character', 'a'],
    ['81 characters', 'x'.repeat(81)],
    ['nine tokens', 'aa bb cc dd ee ff gg hh ii'],
    ['33-character token', `aa ${'x'.repeat(33)}`],
    ['NUL control', 'ab\u0000cd'],
    ['newline control', 'ab\ncd'],
    ['format control', 'ab\u200bcd'],
    ['literal percent', 'ab%cd'],
    ['literal underscore', 'ab_cd'],
    ['backslash', 'ab\\cd'],
  ])('rejects invalid search: %s', async (_label, search) => {
    const { errors } = await validateQuery({ search });

    expect(errors).not.toEqual([]);
  });

  it.each([
    '',
    'Hops',
    '-hops',
    'hops-',
    'two--hops',
    'hops_and_malts',
    'x'.repeat(65),
    ['hops', 'hops'],
  ])('rejects invalid category %p', async (category) => {
    const { errors } = await validateQuery({ category });

    expect(errors).not.toEqual([]);
  });

  it.each(['minPriceMinor', 'maxPriceMinor', 'page', 'limit'] as const)(
    'rejects non-canonical %s lexical forms',
    async (field) => {
      const malformed = [
        '01',
        '+1',
        '-0',
        '1.0',
        '1e2',
        '0x10',
        ' 1',
        '1 ',
        '',
        '999999999999999999999999999999999999',
      ];

      for (const value of malformed) {
        const result = await validateQuery({ [field]: value });
        expect(result.errors).not.toEqual([]);
      }
    },
  );

  it.each([
    ['minPriceMinor', '2147483648'],
    ['maxPriceMinor', '2147483648'],
    ['page', '0'],
    ['page', '201'],
    ['limit', '0'],
    ['limit', '49'],
  ])('rejects out-of-range %s=%s', async (field, value) => {
    const result = await validateQuery({ [field]: value });

    expect(result.errors).not.toEqual([]);
  });

  it.each([
    ['search', ['aa', 'bb']],
    ['minPriceMinor', ['1', '2']],
    ['maxPriceMinor', ['1', '2']],
    ['sort', ['name-asc', 'name-desc']],
    ['page', ['1', '2']],
    ['limit', ['1', '2']],
  ] as const)('rejects repeated scalar %s', async (field, values) => {
    const result = await validateQuery({ [field]: values });

    expect(result.errors).not.toEqual([]);
  });

  it('normalizes one category and accepts unique repeated categories', async () => {
    const single = await validateQuery({ category: 'hops' });
    const repeated = await validateQuery({
      category: ['hops', 'malts', 'yeast', 'adjuncts'],
    });

    expect(single.errors).toEqual([]);
    expect(single.value.category).toEqual(['hops']);
    expect(repeated.errors).toEqual([]);
    expect(repeated.value.category).toEqual([
      'hops',
      'malts',
      'yeast',
      'adjuncts',
    ]);
  });

  it('keeps the admin category query scalar', async () => {
    const value = plainToInstance(AdminCatalogQueryDto, { category: 'hops' });
    const errors = await validate(value, {
      forbidNonWhitelisted: true,
      whitelist: true,
    });

    expect(errors).toEqual([]);
    expect(value.category).toBe('hops');
  });

  it('rejects list syntax, unknown parameters, unsupported sort and min > max', async () => {
    const cases = [
      { 'page[]': '1' },
      { unknown: 'value' },
      { sort: 'created-desc' },
      { maxPriceMinor: '9', minPriceMinor: '10' },
    ];

    for (const query of cases) {
      const result = await validateQuery(query);
      expect(result.errors).not.toEqual([]);
    }
  });
});
