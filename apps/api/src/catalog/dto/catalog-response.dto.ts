import { ApiProperty } from '@nestjs/swagger';
import { CATALOG_SORT_VALUES, type CatalogSort } from './catalog-query.dto';
import { ProductCategoryDto, ProductDto } from './product.dto';

export class CatalogFiltersDto {
  @ApiProperty({
    description:
      'Normalized Unicode NFC search; null when omitted. Control characters and literal backslash, percent and underscore are forbidden.',
    maxLength: 80,
    minLength: 2,
    nullable: true,
    type: String,
  })
  search!: string | null;

  @ApiProperty({
    maxLength: 64,
    nullable: true,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    type: String,
  })
  category!: string | null;

  @ApiProperty({
    format: 'int32',
    maximum: 2_147_483_647,
    minimum: 0,
    nullable: true,
    type: 'integer',
  })
  minPriceMinor!: number | null;

  @ApiProperty({
    format: 'int32',
    maximum: 2_147_483_647,
    minimum: 0,
    nullable: true,
    type: 'integer',
  })
  maxPriceMinor!: number | null;
}

export class CatalogFacetsDto {
  @ApiProperty({ isArray: true, type: () => ProductCategoryDto })
  categories!: ProductCategoryDto[];
}

export class CatalogMetaDto {
  @ApiProperty({ format: 'int32', maximum: 200, minimum: 1, type: 'integer' })
  page!: number;

  @ApiProperty({ format: 'int32', maximum: 48, minimum: 1, type: 'integer' })
  limit!: number;

  @ApiProperty({
    format: 'int32',
    maximum: 2_147_483_647,
    minimum: 0,
    type: 'integer',
  })
  totalItems!: number;

  @ApiProperty({ format: 'int32', maximum: 200, minimum: 0, type: 'integer' })
  totalPages!: number;

  @ApiProperty({ type: Boolean })
  hasNextPage!: boolean;

  @ApiProperty({ type: Boolean })
  hasPreviousPage!: boolean;

  @ApiProperty({ enum: CATALOG_SORT_VALUES, type: String })
  sort!: CatalogSort;

  @ApiProperty({ enum: ['USD'], type: String })
  currency!: 'USD';

  @ApiProperty({ type: () => CatalogFiltersDto })
  filters!: CatalogFiltersDto;

  @ApiProperty({ type: () => CatalogFacetsDto })
  facets!: CatalogFacetsDto;
}

export class CatalogResponseDto {
  @ApiProperty({ isArray: true, type: () => ProductDto })
  items!: ProductDto[];

  @ApiProperty({ type: () => CatalogMetaDto })
  meta!: CatalogMetaDto;
}
