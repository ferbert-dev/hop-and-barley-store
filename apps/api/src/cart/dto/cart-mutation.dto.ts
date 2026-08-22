import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class AddCartItemDto {
  @ApiProperty({
    maxLength: 64,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    type: String,
  })
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  productSlug!: string;

  @ApiProperty({ format: 'int32', maximum: 99, minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class UpdateCartItemDto {
  @ApiProperty({ format: 'int32', maximum: 99, minimum: 1, type: 'integer' })
  @IsInt()
  @Min(1)
  @Max(99)
  quantity!: number;
}

export class CartProductSlugDto {
  @ApiProperty({
    maxLength: 64,
    pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    type: String,
  })
  @IsString()
  @MaxLength(64)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  productSlug!: string;
}
