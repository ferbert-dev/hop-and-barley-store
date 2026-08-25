import { SetMetadata } from '@nestjs/common';

export const CART_BODYLESS_MUTATION_KEY = 'cartBodylessMutation';

export const CartBodylessMutation = () =>
  SetMetadata(CART_BODYLESS_MUTATION_KEY, true);
