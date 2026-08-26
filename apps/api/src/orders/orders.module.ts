import { Module } from '@nestjs/common';
import { CartModule } from '../cart/cart.module';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';
import { OrdersController } from './orders.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [OrdersController],
  exports: [OrdersService],
  imports: [CartModule],
  providers: [IdempotencyKeyPipe, OrdersService],
})
export class OrdersModule {}
