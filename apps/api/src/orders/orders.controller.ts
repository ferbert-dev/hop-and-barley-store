import {
  Body,
  Controller,
  Headers,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOperation,
  ApiSecurity,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import type { AuthRequest } from '../auth/auth-request';
import { CartCapabilityGuard } from '../cart/cart-capability.guard';
import { type CartCookieMode, clearCartCookie } from '../cart/cart-cookie';
import type { CartRequest } from '../cart/cart-request';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderDto } from './dto/order-response.dto';
import { IdempotencyKeyPipe } from './idempotency-key.pipe';
import { OrdersService } from './orders.service';

type CheckoutRequest = AuthRequest & CartRequest;

@ApiTags('orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly idempotencyKeys: IdempotencyKeyPipe,
    private readonly config: ConfigService,
  ) {}

  @Post()
  @UseGuards(CartCapabilityGuard)
  @ApiSecurity({ cartCookie: [], sessionCookie: [] })
  @ApiOperation({
    description:
      'Creates a server-priced Cash on Delivery order from the authenticated user’s active cart reservation. Debit Card is finalized only by the future verified Stripe webhook boundary and cannot be finalized by this browser route.',
    summary: 'Create an order from the active reserved cart',
  })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    schema: {
      pattern: '^[A-Za-z0-9_-]{1,16}\\.[A-Za-z0-9_-]{43}$',
      type: 'string',
    },
  })
  @ApiHeader({
    description:
      'Retry key scoped to the authenticated user. Reuse with different input fails.',
    name: 'Idempotency-Key',
    required: true,
    schema: {
      maxLength: 128,
      minLength: 8,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$',
      type: 'string',
    },
  })
  @ApiBody({ required: true, type: CreateOrderDto })
  @ApiCreatedResponse({
    headers: {
      'Set-Cookie': {
        description:
          'Clears the consumed cart capability after every successful or idempotently replayed browser order response.',
        schema: { type: 'string' },
      },
    },
    type: OrderDto,
  })
  @ApiBadRequestResponse({
    description: 'Invalid or unknown checkout input or idempotency key',
  })
  @ApiUnauthorizedResponse({
    description: 'Session or cart capability is not valid',
  })
  @ApiForbiddenResponse({ description: 'Origin or session CSRF is not valid' })
  @ApiConflictResponse({
    description:
      'Idempotency key, cart or payment reference was reused differently',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'Cart, reservation, product, quantity, stock or payment method is unavailable',
  })
  @ApiUnsupportedMediaTypeResponse({ description: 'JSON body required' })
  async create(
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() dto: CreateOrderDto,
    @Req() request: CheckoutRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<OrderDto> {
    const idempotencyKey = this.idempotencyKeys.transform(rawIdempotencyKey);
    const session = requireActiveSession(request);
    const cart = requireActiveCart(request);
    const order = await this.orders.create(
      {
        cartId: cart.cartId,
        idempotencyKey,
        userId: session.userId,
      },
      dto,
    );
    response.setHeader('Set-Cookie', clearCartCookie(this.cookieMode()));
    return order;
  }

  private cookieMode(): CartCookieMode {
    return this.config.getOrThrow<CartCookieMode>('CART_COOKIE_MODE');
  }
}

function requireActiveSession(request: CheckoutRequest) {
  if (!request.activeSession) throw new Error('Session guard invariant failed');
  return request.activeSession;
}

function requireActiveCart(request: CheckoutRequest) {
  if (!request.activeCart) throw new Error('Cart guard invariant failed');
  return request.activeCart;
}
