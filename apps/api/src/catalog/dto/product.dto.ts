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

  @ApiProperty({ enum: ['USD'], type: String })
  currency!: 'USD';

  @ApiProperty({ type: String })
  teaser!: string;

  @ApiProperty({ type: String })
  priceQualifier!: string;

  @ApiProperty({
    example: '/assets/products/cascade-hops.webp',
    pattern: '^/assets/products/[a-z0-9]+(?:-[a-z0-9]+)*[.]webp$',
    type: String,
  })
  imagePath!: string;

  @ApiProperty({ enum: ['in-stock', 'out-of-stock'], type: String })
  availability!: 'in-stock' | 'out-of-stock';

  @ApiProperty({ type: () => ProductCategoryDto })
  category!: ProductCategoryDto;
}
