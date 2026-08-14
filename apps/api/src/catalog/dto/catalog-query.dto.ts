import { Transform } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateBy,
  ValidateIf,
  type ValidationArguments,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export const CATALOG_SORT_VALUES = [
  'name-asc',
  'name-desc',
  'price-asc',
  'price-desc',
] as const;

export type CatalogSort = (typeof CATALOG_SORT_VALUES)[number];

const MAX_PRICE_MINOR = 2_147_483_647;
const CATEGORY_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANONICAL_UNSIGNED_INTEGER = /^(?:0|[1-9][0-9]*)$/;
const UNICODE_CONTROL = /\p{C}/u;
const SEARCH_FORBIDDEN_LITERAL = /[\\%_]/u;
const SEARCH_WHITESPACE = /\p{White_Space}+/gu;

function normalizeSearchValue(value: unknown): unknown {
  if (typeof value !== 'string') return value;

  const normalized = value.normalize('NFC');
  if (
    UNICODE_CONTROL.test(normalized) ||
    SEARCH_FORBIDDEN_LITERAL.test(normalized)
  ) {
    return normalized;
  }

  const collapsed = normalized.trim().replace(SEARCH_WHITESPACE, ' ');
  return collapsed.length === 0 ? undefined : collapsed;
}

function transformCanonicalInteger(
  value: unknown,
  minimum: number,
  maximum: number,
): unknown {
  if (typeof value !== 'string' || !CANONICAL_UNSIGNED_INTEGER.test(value)) {
    return value;
  }

  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : value;
}

function isValidSearch(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (UNICODE_CONTROL.test(value) || SEARCH_FORBIDDEN_LITERAL.test(value)) {
    return false;
  }

  const characters = Array.from(value);
  if (characters.length < 2 || characters.length > 80) return false;

  const tokens = value.split(' ');
  return (
    tokens.length <= 8 &&
    tokens.every((token) => Array.from(token).length <= 32)
  );
}

function isMaxNotLessThanMin(
  value: unknown,
  arguments_: ValidationArguments,
): boolean {
  if (typeof value !== 'number') return true;
  const minimum = (arguments_.object as CatalogQueryDto).minPriceMinor;
  return typeof minimum !== 'number' || minimum <= value;
}

export class CatalogQueryDto {
  @ApiPropertyOptional({
    description:
      'Unicode NFC search (2-80 characters, at most 8 space-delimited tokens and 32 characters per token); control characters and literal backslash, percent and underscore are forbidden.',
    maxLength: 80,
    minLength: 2,
    type: String,
  })
  @Transform(({ value }) => normalizeSearchValue(value))
  @ValidateIf((_object, value) => value !== undefined)
  @ValidateBy({
    name: 'catalogSearch',
    validator: { validate: isValidSearch },
  })
  search?: string;

  @ApiPropertyOptional({
    maxLength: 64,
    pattern: CATEGORY_SLUG.source,
    type: String,
  })
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @MaxLength(64)
  @Matches(CATEGORY_SLUG)
  category?: string;

  @ApiPropertyOptional({
    format: 'int32',
    maximum: MAX_PRICE_MINOR,
    minimum: 0,
    type: 'integer',
  })
  @Transform(({ value }) =>
    transformCanonicalInteger(value, 0, MAX_PRICE_MINOR),
  )
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_MINOR)
  minPriceMinor?: number;

  @ApiPropertyOptional({
    format: 'int32',
    maximum: MAX_PRICE_MINOR,
    minimum: 0,
    type: 'integer',
  })
  @Transform(({ value }) =>
    transformCanonicalInteger(value, 0, MAX_PRICE_MINOR),
  )
  @ValidateIf((_object, value) => value !== undefined)
  @IsInt()
  @Min(0)
  @Max(MAX_PRICE_MINOR)
  @ValidateBy({
    name: 'catalogPriceRange',
    validator: { validate: isMaxNotLessThanMin },
  })
  maxPriceMinor?: number;

  @ApiPropertyOptional({
    default: 'name-asc',
    enum: CATALOG_SORT_VALUES,
    type: String,
  })
  @IsIn(CATALOG_SORT_VALUES)
  sort: CatalogSort = 'name-asc';

  @ApiPropertyOptional({
    default: 1,
    format: 'int32',
    maximum: 200,
    minimum: 1,
    type: 'integer',
  })
  @Transform(({ value }) => transformCanonicalInteger(value, 1, 200))
  @IsInt()
  @Min(1)
  @Max(200)
  page = 1;

  @ApiPropertyOptional({
    default: 12,
    format: 'int32',
    maximum: 48,
    minimum: 1,
    type: 'integer',
  })
  @Transform(({ value }) => transformCanonicalInteger(value, 1, 48))
  @IsInt()
  @Min(1)
  @Max(48)
  limit = 12;
}
