import { ApiProperty } from '@nestjs/swagger';

export class CartMergeResponseDto {
  @ApiProperty({ enum: ['not_present', 'succeeded', 'unavailable'] })
  cartMerge!: 'not_present' | 'succeeded' | 'unavailable';
}
