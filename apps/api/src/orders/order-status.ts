import { ConflictException } from '@nestjs/common';
import type { OrderStatus } from '../generated/prisma/enums';

const transitions: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  PLACED: ['SHIPPED', 'CANCELLED'],
  PAID: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export function assertOrderStatusTransition(
  current: OrderStatus,
  next: OrderStatus,
): void {
  if (!transitions[current].includes(next)) {
    throw new ConflictException({ status: 'invalid-order-transition' });
  }
}
