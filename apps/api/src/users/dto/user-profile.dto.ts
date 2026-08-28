import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CustomerProfilePatchDto {
  @ApiPropertyOptional({ maxLength: 200, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fullName?: string | null;

  @ApiPropertyOptional({
    description: 'Stored exactly as submitted for the MVP.',
    maxLength: 32,
    nullable: true,
    type: String,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;
}

export class PrimaryAddressPatchDto {
  @ApiPropertyOptional({ maxLength: 120, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  country?: string | null;

  @ApiPropertyOptional({ maxLength: 120, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  city?: string | null;

  @ApiPropertyOptional({ maxLength: 32, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  postalCode?: string | null;

  @ApiPropertyOptional({ maxLength: 200, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  street?: string | null;

  @ApiPropertyOptional({ maxLength: 32, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  houseNumber?: string | null;

  @ApiPropertyOptional({ maxLength: 64, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  apartmentUnit?: string | null;

  @ApiPropertyOptional({ maxLength: 32, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  floor?: string | null;

  @ApiPropertyOptional({ maxLength: 500, nullable: true, type: String })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  additionalInfo?: string | null;
}

export class UpdateCurrentUserDto {
  @ApiPropertyOptional({
    nullable: true,
    type: () => CustomerProfilePatchDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => CustomerProfilePatchDto)
  profile?: CustomerProfilePatchDto | null;

  @ApiPropertyOptional({
    nullable: true,
    type: () => PrimaryAddressPatchDto,
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => PrimaryAddressPatchDto)
  primaryAddress?: PrimaryAddressPatchDto | null;
}

export class AvatarMetadataDto {
  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  contentType!: 'image/jpeg' | 'image/png' | 'image/webp';

  @ApiProperty({ maximum: 2_097_152, minimum: 1, type: 'integer' })
  sizeBytes!: number;

  @ApiProperty({ format: 'date-time', type: String })
  updatedAt!: string;
}

export class CustomerProfileDto {
  @ApiProperty({ nullable: true, type: String })
  fullName!: string | null;

  @ApiProperty({ nullable: true, type: String })
  phone!: string | null;

  @ApiProperty({ nullable: true, type: () => AvatarMetadataDto })
  avatar!: AvatarMetadataDto | null;
}

export class PrimaryAddressDto {
  @ApiProperty({ nullable: true, type: String })
  country!: string | null;

  @ApiProperty({ nullable: true, type: String })
  city!: string | null;

  @ApiProperty({ nullable: true, type: String })
  postalCode!: string | null;

  @ApiProperty({ nullable: true, type: String })
  street!: string | null;

  @ApiProperty({ nullable: true, type: String })
  houseNumber!: string | null;

  @ApiProperty({ nullable: true, type: String })
  apartmentUnit!: string | null;

  @ApiProperty({ nullable: true, type: String })
  floor!: string | null;

  @ApiProperty({ nullable: true, type: String })
  additionalInfo!: string | null;
}

export class CurrentUserProfileDto {
  @ApiProperty({ type: String })
  email!: string;

  @ApiProperty({ enum: ['CUSTOMER', 'ADMIN'] })
  role!: 'CUSTOMER' | 'ADMIN';

  @ApiProperty({ nullable: true, type: () => CustomerProfileDto })
  profile!: CustomerProfileDto | null;

  @ApiProperty({ nullable: true, type: () => PrimaryAddressDto })
  primaryAddress!: PrimaryAddressDto | null;
}
