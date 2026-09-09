import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsISO31661Alpha2,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  Validate,
  ValidateNested,
  type ValidationArguments,
  ValidatorConstraint,
  type ValidatorConstraintInterface,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CheckoutPaymentMethod } from '../../orders/dto/create-order.dto';

@ValidatorConstraint({ name: 'boundedPostalCodePolicy', async: false })
class BoundedPostalCodePolicy implements ValidatorConstraintInterface {
  validate(value: unknown, arguments_: ValidationArguments): boolean {
    const countryCode = (arguments_.object as CheckoutDeliveryDto).countryCode;
    if (
      typeof value === 'string' &&
      (value.length === 0 || value.length > 32)
    ) {
      return false;
    }
    if (countryCode === 'DE') {
      return typeof value === 'string' && /^[0-9]{5}$/.test(value);
    }
    if (countryCode === 'US') {
      return (
        typeof value === 'string' && /^[0-9]{5}(?:-[0-9]{4})?$/.test(value)
      );
    }
    return value === undefined || typeof value === 'string';
  }

  defaultMessage(): string {
    return 'postalCode does not satisfy the supported country policy';
  }
}

@ValidatorConstraint({ name: 'boundedAdministrativeAreaPolicy', async: false })
class BoundedAdministrativeAreaPolicy implements ValidatorConstraintInterface {
  validate(value: unknown, arguments_: ValidationArguments): boolean {
    const countryCode = (arguments_.object as CheckoutDeliveryDto).countryCode;
    if (
      typeof value === 'string' &&
      (value.length === 0 || value.length > 120)
    ) {
      return false;
    }
    if (countryCode === 'US') {
      return typeof value === 'string' && /^[A-Za-z]{2}$/.test(value);
    }
    return value === undefined || typeof value === 'string';
  }

  defaultMessage(): string {
    return 'administrativeArea does not satisfy the supported country policy';
  }
}

export class CheckoutDeliveryDto {
  @ApiProperty({ example: 'DE', pattern: '^[A-Z]{2}$', type: String })
  @Transform(({ value }: { value: unknown }) => uppercaseTrimmed(value))
  @IsString()
  @IsISO31661Alpha2()
  @Matches(/^[A-Z]{2}$/)
  countryCode!: string;

  @ApiProperty({ maxLength: 120, minLength: 1, type: String })
  @Transform(({ value }: { value: unknown }) => trimRequired(value))
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  city!: string;

  @ApiProperty({ maxLength: 200, minLength: 1, type: String })
  @Transform(({ value }: { value: unknown }) => trimRequired(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  street!: string;

  @ApiPropertyOptional({ maxLength: 32, type: String })
  @Transform(({ value }: { value: unknown }) => trimOptional(value))
  @Validate(BoundedPostalCodePolicy)
  postalCode?: string;

  @ApiPropertyOptional({ maxLength: 120, type: String })
  @Transform(({ value }: { value: unknown }) => trimOptional(value))
  @Validate(BoundedAdministrativeAreaPolicy)
  administrativeArea?: string;

  @ApiPropertyOptional({ maxLength: 32, type: String })
  @Transform(({ value }: { value: unknown }) => trimOptional(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  houseNumber?: string;

  @ApiPropertyOptional({ maxLength: 64, type: String })
  @Transform(({ value }: { value: unknown }) => trimOptional(value))
  @IsOptional()
  @IsString()
  @MaxLength(64)
  apartmentUnit?: string;

  @ApiPropertyOptional({ maxLength: 32, type: String })
  @Transform(({ value }: { value: unknown }) => trimOptional(value))
  @IsOptional()
  @IsString()
  @MaxLength(32)
  floor?: string;

  @ApiPropertyOptional({ maxLength: 500, type: String })
  @Transform(({ value }: { value: unknown }) => trimOptional(value))
  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionalInfo?: string;
}

export class SaveCheckoutDraftDto {
  @ApiProperty({ format: 'email', maxLength: 320, type: String })
  @Transform(({ value }: { value: unknown }) => normalizedEmail(value))
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @ApiProperty({ maxLength: 200, minLength: 1, type: String })
  @Transform(({ value }: { value: unknown }) => trimRequired(value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  fullName!: string;

  @ApiProperty({ maxLength: 32, minLength: 3, type: String })
  @Transform(({ value }: { value: unknown }) => trimRequired(value))
  @IsString()
  @MinLength(3)
  @MaxLength(32)
  phoneNumber!: string;

  @ApiProperty({ enum: CheckoutPaymentMethod, type: String })
  @IsEnum(CheckoutPaymentMethod)
  paymentMethod!: CheckoutPaymentMethod;

  @ApiProperty({ type: () => CheckoutDeliveryDto })
  @ValidateNested()
  @Type(() => CheckoutDeliveryDto)
  delivery!: CheckoutDeliveryDto;
}

export class CheckoutDraftDeliveryDto {
  @ApiProperty({ type: String })
  countryCode!: string;

  @ApiProperty({ type: String })
  city!: string;

  @ApiProperty({ type: String })
  street!: string;

  @ApiProperty({ nullable: true, type: String })
  postalCode!: string | null;

  @ApiProperty({ nullable: true, type: String })
  administrativeArea!: string | null;

  @ApiProperty({ nullable: true, type: String })
  houseNumber!: string | null;

  @ApiProperty({ nullable: true, type: String })
  apartmentUnit!: string | null;

  @ApiProperty({ nullable: true, type: String })
  floor!: string | null;

  @ApiProperty({ nullable: true, type: String })
  additionalInfo!: string | null;
}

export class CheckoutDraftDto {
  @ApiProperty({ enum: ['pre_payment'], type: String })
  status!: 'pre_payment';

  @ApiProperty({ enum: CheckoutPaymentMethod, type: String })
  paymentMethod!: CheckoutPaymentMethod;

  @ApiProperty({ format: 'email', type: String })
  email!: string;

  @ApiProperty({ type: String })
  fullName!: string;

  @ApiProperty({ type: String })
  phoneNumber!: string;

  @ApiProperty({ type: () => CheckoutDraftDeliveryDto })
  delivery!: CheckoutDraftDeliveryDto;

  @ApiProperty({ format: 'date-time', nullable: true, type: String })
  expiresAt!: string | null;

  @ApiProperty({ format: 'date-time', type: String })
  updatedAt!: string;
}

function trimRequired(value: unknown): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

function trimOptional(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}

function uppercaseTrimmed(value: unknown): unknown {
  const trimmed = trimRequired(value);
  return typeof trimmed === 'string' ? trimmed.toUpperCase() : trimmed;
}

function normalizedEmail(value: unknown): unknown {
  const trimmed = trimRequired(value);
  return typeof trimmed === 'string' ? trimmed.toLowerCase() : trimmed;
}
