import { ApiProperty } from '@nestjs/swagger';

export class PurchaseLikeCountDto {
  @ApiProperty({
    description: 'Public aggregate of accepted completed-purchase Likes.',
    minimum: 0,
    type: Number,
  })
  count!: number;
}

export class PurchaseLikeResponseDto extends PurchaseLikeCountDto {
  @ApiProperty({
    description: 'Always true after this accessible purchase increments Likes.',
    type: Boolean,
  })
  liked!: true;
}
