import { ApiProperty } from '@nestjs/swagger';

export class PurchaseLikeCountDto {
  @ApiProperty({
    description: 'Public count of completed-purchase Likes.',
    minimum: 0,
    type: Number,
  })
  count!: number;
}

export class PurchaseLikeResponseDto extends PurchaseLikeCountDto {
  @ApiProperty({
    description: 'Always true when this accessible purchase has a Like.',
    type: Boolean,
  })
  liked!: true;
}
