import type { Request } from 'express';

export type ActiveCartCapability = Readonly<{
  cartId: string;
  expiresAt: Date;
  rawToken: string;
}>;

export type CartRequest = Request & {
  activeCart?: ActiveCartCapability;
  cartBootstrap?: boolean;
  cartRequestId?: string;
};
