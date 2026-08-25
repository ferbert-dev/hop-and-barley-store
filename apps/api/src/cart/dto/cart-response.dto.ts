import { ApiProperty } from '@nestjs/swagger';

export class CartItemDto {
  @ApiProperty({ format: 'uuid', type: String })
  productId!: string;

  @ApiProperty({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: String })
  productSlug!: string;

  @ApiProperty({ type: String })
  name!: string;

  @ApiProperty({ type: String })
  imagePath!: string;

  @ApiProperty({ type: String })
  priceQualifier!: string;

  @ApiProperty({ format: 'int32', maximum: 99, minimum: 1, type: 'integer' })
  quantity!: number;

  @ApiProperty({
    format: 'int32',
    minimum: 0,
    nullable: true,
    type: 'integer',
  })
  currentUnitPriceMinor!: number | null;

  @ApiProperty({
    format: 'int32',
    minimum: 0,
    nullable: true,
    type: 'integer',
  })
  lineTotalMinor!: number | null;

  @ApiProperty({ enum: ['available', 'unavailable'], type: String })
  availability!: 'available' | 'unavailable';

  @ApiProperty({
    enum: ['active', 'expired', 'unreserved'],
    type: String,
  })
  reservationStatus!: 'active' | 'expired' | 'unreserved';

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
  })
  reservationExpiresAt!: string | null;
}

export class CartDto {
  @ApiProperty({ enum: ['USD'], type: String })
  currency!: 'USD';

  @ApiProperty({ type: () => [CartItemDto] })
  items!: CartItemDto[];

  @ApiProperty({ format: 'int32', minimum: 0, type: 'integer' })
  distinctItemCount!: number;

  @ApiProperty({ format: 'int32', minimum: 0, type: 'integer' })
  totalQuantity!: number;

  @ApiProperty({ format: 'int32', minimum: 0, type: 'integer' })
  subtotalMinor!: number;

  @ApiProperty({ type: Boolean })
  checkoutEligible!: boolean;

  @ApiProperty({ format: 'date-time', type: String })
  serverNow!: string;

  @ApiProperty({ nullable: true, type: String })
  adjustmentMessage!: string | null;
}

export class CartCsrfResponseDto {
  @ApiProperty({
    pattern: '^[A-Za-z0-9_-]{1,16}\\.[A-Za-z0-9_-]{43}$',
    type: String,
  })
  csrfToken!: string;
}
