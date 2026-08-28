import { Transform } from 'class-transformer';
import {
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ProductSpecificationDto } from '../../catalog/dto/product-detail.dto';

export const ADMIN_PRODUCT_SALE_KINDS = ['WEIGHT', 'PACKAGE'] as const;
export type AdminProductSaleKind = (typeof ADMIN_PRODUCT_SALE_KINDS)[number];

const CANONICAL_INTEGER = /^(?:0|[1-9]\d*)$/;
const POSITIVE_CANONICAL_INTEGER = /^[1-9]\d*$/;
const USD_DECIMAL = /^(?!0\.0{1,2}$)(?:0|[1-9]\d{0,7})\.\d{1,2}$/;
const ISO_INSTANT_WITH_ZONE = /(?:Z|[+-]\d{2}:\d{2})$/;

export class AdminProductCreateCategoryDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: String })
  slug!: string;

  @ApiProperty({ type: String })
  name!: string;
}

export class AdminProductCreateOptionsDto {
  @ApiProperty({ isArray: true, type: () => AdminProductCreateCategoryDto })
  categories!: AdminProductCreateCategoryDto[];

  @ApiProperty({ enum: ADMIN_PRODUCT_SALE_KINDS, isArray: true })
  saleKinds!: AdminProductSaleKind[];
}

export class AdminCreateProductBodyDto {
  @ApiProperty({ maxLength: 160, minLength: 1, type: String })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  name!: string;

  @ApiProperty({ maxLength: 5_000, minLength: 1, type: String })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(5_000)
  description!: string;

  @ApiProperty({
    description:
      'Positive USD decimal string with one or two fractional digits; minor units must fit int32.',
    example: '5.99',
    maxLength: 11,
    pattern: USD_DECIMAL.source,
    type: String,
  })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(11)
  @Matches(USD_DECIMAL)
  price!: string;

  @ApiProperty({
    description: 'One of the four IDs returned by create-options.',
    format: 'uuid',
    type: String,
  })
  @Transform(({ value }) => trimString(value))
  @IsUUID('4')
  categoryId!: string;

  @ApiProperty({ enum: ADMIN_PRODUCT_SALE_KINDS, type: String })
  @Transform(({ value }) => trimString(value))
  @IsIn(ADMIN_PRODUCT_SALE_KINDS)
  saleKind!: AdminProductSaleKind;

  @ApiProperty({
    description:
      'Canonical non-negative inventory integer, at most 2000000000.',
    example: '100000000',
    maxLength: 10,
    pattern: CANONICAL_INTEGER.source,
    type: String,
  })
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MaxLength(10)
  @Matches(CANONICAL_INTEGER)
  stockAmount!: string;

  @ApiProperty({ enum: ['true', 'false'], type: String })
  @Transform(({ value }) => trimString(value))
  @IsIn(['true', 'false'])
  isActive!: 'true' | 'false';

  @ApiPropertyOptional({
    description:
      'ISO instant with Z or numeric offset; defaults to the server current instant.',
    format: 'date-time',
    pattern: ISO_INSTANT_WITH_ZONE.source,
    type: String,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(ISO_INSTANT_WITH_ZONE)
  activeFrom?: string;

  @ApiPropertyOptional({
    description:
      'ISO instant with Z or numeric offset; must be strictly after activeFrom.',
    format: 'date-time',
    pattern: ISO_INSTANT_WITH_ZONE.source,
    type: String,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(ISO_INSTANT_WITH_ZONE)
  activeUntil?: string;

  @ApiPropertyOptional({
    description:
      'PACKAGE-only canonical positive net weight in milligrams, bounded to int32.',
    maxLength: 10,
    pattern: POSITIVE_CANONICAL_INTEGER.source,
    type: String,
  })
  @Transform(({ value }) => trimString(value))
  @IsOptional()
  @IsString()
  @MaxLength(10)
  @Matches(POSITIVE_CANONICAL_INTEGER)
  packageNetWeightMg?: string;
}

export class AdminCreateProductMultipartDto extends AdminCreateProductBodyDto {
  @ApiProperty({
    description: 'One JPEG, PNG or WebP image, at most 5 MiB.',
    format: 'binary',
    type: String,
  })
  image!: string;
}

export class AdminCreatedProductDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: String })
  slug!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  teaser!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({ format: 'int32', minimum: 1, type: 'integer' })
  priceMinor!: number;

  @ApiProperty({ enum: ['USD'], type: String })
  currency!: 'USD';

  @ApiProperty({ enum: ['per 100g', 'per package'], type: String })
  priceQualifier!: 'per 100g' | 'per package';

  @ApiProperty({ type: () => AdminProductCreateCategoryDto })
  category!: AdminProductCreateCategoryDto;

  @ApiProperty({ enum: ADMIN_PRODUCT_SALE_KINDS, type: String })
  saleKind!: AdminProductSaleKind;

  @ApiProperty({ enum: ['MILLIGRAM', 'EACH'], type: String })
  amountUnit!: 'MILLIGRAM' | 'EACH';

  @ApiProperty({ format: 'int32', minimum: 1, type: 'integer' })
  priceBasisAmount!: number;

  @ApiProperty({ format: 'int32', minimum: 1, type: 'integer' })
  minimumOrderAmount!: number;

  @ApiProperty({ format: 'int32', minimum: 1, type: 'integer' })
  orderStepAmount!: number;

  @ApiProperty({
    format: 'int32',
    maximum: 100_000_000,
    minimum: 1,
    nullable: true,
    type: 'integer',
  })
  maximumOrderAmount!: number | null;

  @ApiProperty({
    format: 'int32',
    maximum: 2_000_000_000,
    minimum: 0,
    type: 'integer',
  })
  stockAmount!: number;

  @ApiProperty({
    format: 'int32',
    maximum: 2_147_483_647,
    minimum: 1,
    nullable: true,
    type: 'integer',
  })
  packageNetWeightMg!: number | null;

  @ApiProperty({ type: Boolean })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time', type: String })
  activeFrom!: Date;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  activeUntil!: Date | null;

  @ApiProperty({
    example: '/product-assets/7ed6a7c7-5210-4b1f-ae50-0d8d596216cb.webp',
    pattern:
      '^/product-assets/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}[.]webp$',
    type: String,
  })
  imagePath!: string;

  @ApiProperty({
    isArray: true,
    minItems: 1,
    type: () => ProductSpecificationDto,
  })
  specifications!: ProductSpecificationDto[];

  @ApiProperty({ format: 'date-time', type: String })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time', type: String })
  updatedAt!: Date;
}

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
