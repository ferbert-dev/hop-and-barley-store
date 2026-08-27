import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export enum CheckoutPaymentMethod {
  CASH_ON_DELIVERY = 'cash_on_delivery',
  STRIPE_DEBIT_CARD = 'stripe_debit_card',
}

export class CreateOrderItemDto {
  @ApiProperty({
    maxLength: 64,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    type: String,
  })
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  productSlug!: string;

  @ApiProperty({
    format: 'int32',
    maximum: 2_000_000_000,
    minimum: 1,
    type: 'integer',
  })
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  amount!: number;
}

export class CreateOrderDto {
  @ApiProperty({ maxLength: 200, minLength: 1, type: String })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({ maxLength: 32, minLength: 3, type: String })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  phoneNumber!: string;

  @ApiProperty({ maxLength: 120, minLength: 1, type: String })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @ApiProperty({ maxLength: 500, minLength: 1, type: String })
  @Transform(({ value }: { value: unknown }) => trimString(value))
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  shippingAddress!: string;

  @ApiProperty({ enum: CheckoutPaymentMethod, type: String })
  @IsEnum(CheckoutPaymentMethod)
  paymentMethod!: CheckoutPaymentMethod;

  @ApiProperty({ maxItems: 50, minItems: 1, type: () => [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ArrayUnique((item: CreateOrderItemDto) => item.productSlug)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}

function trimString(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}
