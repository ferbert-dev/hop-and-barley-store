import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { SessionModule } from '../auth/session/session.module';
import { IdempotencyKeyPipe } from '../orders/idempotency-key.pipe';
import { CheckoutController } from './checkout.controller';
import { CheckoutPrivateHeadersMiddleware } from './checkout-private-headers.middleware';
import { CheckoutService } from './checkout.service';

@Module({
  controllers: [CheckoutController],
  exports: [CheckoutService],
  imports: [CartModule, SessionModule],
  providers: [
    CheckoutPrivateHeadersMiddleware,
    CheckoutService,
    IdempotencyKeyPipe,
  ],
})
export class CheckoutModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(CheckoutPrivateHeadersMiddleware)
      .forRoutes(CheckoutController);
  }
}
