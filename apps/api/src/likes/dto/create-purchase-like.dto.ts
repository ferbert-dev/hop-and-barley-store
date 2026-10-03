import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class CreatePurchaseLikeDto {
  @ApiProperty({
    description:
      'Opaque ID returned only by the private payment-status flow after purchase.',
    format: 'uuid',
    type: String,
  })
  @IsUUID('4')
  paymentAttemptId!: string;
}
