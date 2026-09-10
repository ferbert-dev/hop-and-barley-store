import { Module } from '@nestjs/common';
import { PaymentAttemptService } from './payment-attempt.service';

@Module({
  exports: [PaymentAttemptService],
  providers: [PaymentAttemptService],
})
export class PaymentsModule {}
