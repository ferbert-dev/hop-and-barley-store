import { ApiProperty } from '@nestjs/swagger';
import {
  CATALOG_SORT_VALUES,
  type CatalogSort,
} from '../../catalog/dto/catalog-query.dto';
import { ProductCategoryDto } from '../../catalog/dto/product.dto';

export const ADMIN_PRODUCT_LIFECYCLE_STATUSES = [
  'ACTIVE',
  'ENDING_SOON',
  'DISABLED',
  'SCHEDULED',
  'EXPIRED',
] as const;

export type AdminProductLifecycleStatus =
  (typeof ADMIN_PRODUCT_LIFECYCLE_STATUSES)[number];

export class AdminProductListItemDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: String })
  slug!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  description!: string;

  @ApiProperty({ type: String })
  imagePath!: string;

  @ApiProperty({ example: 499, format: 'int32', minimum: 0, type: 'integer' })
  priceMinor!: number;

  @ApiProperty({ enum: ['EUR'], type: String })
  currency!: 'EUR';

  @ApiProperty({ type: String })
  priceQualifier!: string;

  @ApiProperty({ type: () => ProductCategoryDto })
  category!: ProductCategoryDto;

  @ApiProperty({ enum: ['WEIGHT', 'PACKAGE', 'KIT'], type: String })
  saleKind!: 'WEIGHT' | 'PACKAGE' | 'KIT';

  @ApiProperty({ enum: ['MILLIGRAM', 'EACH'], type: String })
  amountUnit!: 'MILLIGRAM' | 'EACH';

  @ApiProperty({
    format: 'int32',
    maximum: 2_000_000_000,
    minimum: 0,
    type: 'integer',
  })
  stockAmount!: number;

  @ApiProperty({ type: Boolean })
  isActive!: boolean;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  activeFrom!: Date | null;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  activeUntil!: Date | null;

  @ApiProperty({ enum: ADMIN_PRODUCT_LIFECYCLE_STATUSES, type: String })
  lifecycleStatus!: AdminProductLifecycleStatus;

  @ApiProperty({ format: 'date-time', type: String })
  createdAt!: Date;

  @ApiProperty({ format: 'date-time', type: String })
  updatedAt!: Date;
}

export class AdminProductListFiltersDto {
  @ApiProperty({ maxLength: 80, minLength: 2, nullable: true, type: String })
  search!: string | null;

  @ApiProperty({
    maxLength: 64,
    nullable: true,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    type: String,
  })
  category!: string | null;

  @ApiProperty({ nullable: true, type: String })
  lifecycle!: AdminProductLifecycleStatus | null;

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

export class AdminProductListFacetsDto {
  @ApiProperty({ isArray: true, type: () => ProductCategoryDto })
  categories!: ProductCategoryDto[];
}

export class AdminProductListMetaDto {
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

  @ApiProperty({ enum: ['EUR'], type: String })
  currency!: 'EUR';

  @ApiProperty({ type: () => AdminProductListFiltersDto })
  filters!: AdminProductListFiltersDto;

  @ApiProperty({ type: () => AdminProductListFacetsDto })
  facets!: AdminProductListFacetsDto;
}

export class AdminProductListResponseDto {
  @ApiProperty({ isArray: true, type: () => AdminProductListItemDto })
  items!: AdminProductListItemDto[];

  @ApiProperty({ type: () => AdminProductListMetaDto })
  meta!: AdminProductListMetaDto;
}
