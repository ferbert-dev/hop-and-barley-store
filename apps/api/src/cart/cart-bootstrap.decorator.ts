import { SetMetadata } from '@nestjs/common';

export const CART_BOOTSTRAP_KEY = 'hop-and-barley.cart.bootstrap';
export const AllowCartBootstrap = () => SetMetadata(CART_BOOTSTRAP_KEY, true);
