import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { SessionModule } from '../auth/session/session.module';
import { IdempotencyKeyPipe } from '../orders/idempotency-key.pipe';
import { PaymentAttemptService } from './payment-attempt.service';
import { PaymentsController } from './payments.controller';
import { StripeGatewayService } from './stripe-gateway.service';
import { StripePaymentService } from './stripe-payment.service';
import { StripeReconciliationWorker } from './stripe-reconciliation.worker';

@Module({
  controllers: [PaymentsController],
  exports: [PaymentAttemptService, StripePaymentService],
  imports: [CartModule, SessionModule],
  providers: [
    IdempotencyKeyPipe,
    PaymentAttemptService,
    StripeGatewayService,
    StripePaymentService,
    StripeReconciliationWorker,
  ],
})
export class PaymentsModule {}
