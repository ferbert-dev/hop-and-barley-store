import { ApiProperty } from '@nestjs/swagger';

export class PaymentUnavailableDto {
  @ApiProperty({ enum: ['payment-unavailable'], type: String })
  status!: 'payment-unavailable';
}
