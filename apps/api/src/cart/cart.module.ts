import { MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { CartCapabilityGuard } from './cart-capability.guard';
import { CartController } from './cart.controller';
import { CartCsrfService } from './cart-csrf.service';
import { CartMutationGuard } from './cart-mutation.guard';
import { CartPrivateHeadersMiddleware } from './cart-private-headers.middleware';
import { CartService } from './cart.service';

@Module({
  controllers: [CartController],
  exports: [CartCapabilityGuard, CartService],
  providers: [
    CartCapabilityGuard,
    CartCsrfService,
    CartMutationGuard,
    CartPrivateHeadersMiddleware,
    CartService,
  ],
})
export class CartModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CartPrivateHeadersMiddleware).forRoutes(CartController);
  }
}
