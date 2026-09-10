import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class StartStripeCheckoutDto {
  @ApiProperty({ format: 'uuid', type: String })
  @IsUUID('4')
  checkoutDraftId!: string;
}

export class StripeCheckoutSessionDto {
  @ApiProperty({ format: 'uuid', type: String })
  attemptId!: string;

  @ApiProperty({ format: 'uri', type: String })
  checkoutUrl!: string;

  @ApiProperty({ format: 'date-time', type: String })
  expiresAt!: string;

  @ApiProperty({ enum: ['ready_for_redirect'], type: String })
  status!: 'ready_for_redirect';
}

export class StripePaymentStatusDto {
  @ApiProperty({ format: 'uuid', type: String })
  attemptId!: string;

  @ApiProperty({
    enum: [
      'ready_for_redirect',
      'processing',
      'succeeded',
      'failed',
      'cancelled',
    ],
    type: String,
  })
  status!:
    'ready_for_redirect' | 'processing' | 'succeeded' | 'failed' | 'cancelled';
}
