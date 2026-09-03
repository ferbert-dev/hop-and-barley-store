import type { Request } from 'express';

export type ActiveCartCapability = Readonly<{
  cartId: string;
  expiresAt: Date;
  kind?: 'guest';
  rawToken: string;
}>;

export type ActiveAccountCart = Readonly<{
  cartId: string;
  kind: 'account';
  rawToken: string;
  userId: string;
}>;

export type ActiveCartAccess = ActiveCartCapability | ActiveAccountCart;

export type CartRequest = Request & {
  activeCart?: ActiveCartAccess;
  cartBootstrap?: boolean;
  cartRequestId?: string;
};
