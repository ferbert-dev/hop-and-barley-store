import { ApiProperty } from '@nestjs/swagger';

export class ProductCategoryDto {
  @ApiProperty({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: String })
  slug!: string;

  @ApiProperty({ type: String })
  name!: string;
}

export class ProductDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: String })
  slug!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({ example: 499, format: 'int32', minimum: 0, type: 'integer' })
  priceMinor!: number;

  @ApiProperty({ enum: ['WEIGHT', 'PACKAGE', 'KIT'], type: String })
  saleKind!: 'WEIGHT' | 'PACKAGE' | 'KIT';

  @ApiProperty({ enum: ['MILLIGRAM', 'EACH'], type: String })
  amountUnit!: 'MILLIGRAM' | 'EACH';

  @ApiProperty({
    format: 'int32',
    maximum: 2_000_000_000,
    minimum: 1,
    type: 'integer',
  })
  priceBasisAmount!: number;

  @ApiProperty({
    format: 'int32',
    maximum: 2_000_000_000,
    minimum: 1,
    type: 'integer',
  })
  minimumOrderAmount!: number;

  @ApiProperty({
    format: 'int32',
    maximum: 2_000_000_000,
    minimum: 1,
    type: 'integer',
  })
  orderStepAmount!: number;

  @ApiProperty({
    format: 'int32',
    maximum: 2_000_000_000,
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

  @ApiProperty({ format: 'int32', minimum: 1, nullable: true, type: 'integer' })
  packageNetWeightMg!: number | null;

  @ApiProperty({ format: 'int32', minimum: 1, nullable: true, type: 'integer' })
  kitYieldVolumeMl!: number | null;

  @ApiProperty({ enum: ['EUR'], type: String })
  currency!: 'EUR';

  @ApiProperty({ type: String })
  teaser!: string;

  @ApiProperty({ type: String })
  priceQualifier!: string;

  @ApiProperty({
    description:
      'Bundled storefront asset or opaque API-owned uploaded product asset.',
    example: '/product-assets/7ed6a7c7-5210-4b1f-ae50-0d8d596216cb.webp',
    pattern:
      '^(?:/assets/products/[a-z0-9]+(?:-[a-z0-9]+)*|/product-assets/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})[.]webp$',
    type: String,
  })
  imagePath!: string;

  @ApiProperty({ enum: ['in-stock', 'out-of-stock'], type: String })
  availability!: 'in-stock' | 'out-of-stock';

  @ApiProperty({ type: () => ProductCategoryDto })
  category!: ProductCategoryDto;
}
