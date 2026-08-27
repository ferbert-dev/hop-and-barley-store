import { ApiProperty } from '@nestjs/swagger';

export class OrderItemDto {
  @ApiProperty({ pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: String })
  productSlug!: string;

  @ApiProperty({ type: String })
  productName!: string;

  @ApiProperty({ type: String })
  priceQualifier!: string;

  @ApiProperty({ format: 'int32', minimum: 0, type: 'integer' })
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
  amount!: number;

  @ApiProperty({ format: 'int32', minimum: 0, type: 'integer' })
  lineTotalMinor!: number;
}

export class OrderShippingDto {
  @ApiProperty({ type: String })
  fullName!: string;

  @ApiProperty({ type: String })
  phoneNumber!: string;

  @ApiProperty({ type: String })
  city!: string;

  @ApiProperty({ type: String })
  shippingAddress!: string;
}

export class OrderDto {
  @ApiProperty({ format: 'uuid', type: String })
  id!: string;

  @ApiProperty({
    enum: ['placed', 'paid', 'shipped', 'delivered', 'cancelled'],
    type: String,
  })
  status!: 'placed' | 'paid' | 'shipped' | 'delivered' | 'cancelled';

  @ApiProperty({
    enum: ['stripe_debit_card', 'cash_on_delivery'],
    type: String,
  })
  paymentMethod!: 'stripe_debit_card' | 'cash_on_delivery';

  @ApiProperty({ enum: ['paid', 'due_on_delivery'], type: String })
  paymentState!: 'paid' | 'due_on_delivery';

  @ApiProperty({ enum: ['USD'], type: String })
  currency!: 'USD';

  @ApiProperty({ type: () => [OrderItemDto] })
  items!: OrderItemDto[];

  @ApiProperty({ format: 'int32', minimum: 0, type: 'integer' })
  itemSubtotalMinor!: number;

  @ApiProperty({ example: 500, format: 'int32', minimum: 0, type: 'integer' })
  shippingMinor!: number;

  @ApiProperty({ format: 'int32', minimum: 0, type: 'integer' })
  totalMinor!: number;

  @ApiProperty({ type: () => OrderShippingDto })
  shipping!: OrderShippingDto;

  @ApiProperty({ format: 'date-time', type: String })
  placedAt!: string;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  paidAt!: string | null;
}
