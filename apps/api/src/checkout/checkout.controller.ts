import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
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
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
  ApiUnsupportedMediaTypeResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { CartCapabilityGuard } from '../cart/cart-capability.guard';
import { CartMutationGuard } from '../cart/cart-mutation.guard';
import type { CartRequest } from '../cart/cart-request';
import { IdempotencyKeyPipe } from '../orders/idempotency-key.pipe';
import {
  createCheckoutCapabilityCookie,
  readCheckoutCapabilityCookie,
  type CheckoutCookieMode,
} from './checkout-capability-cookie';
import { CheckoutService } from './checkout.service';
import {
  CheckoutDraftDto,
  SaveCheckoutDraftDto,
} from './dto/checkout-draft.dto';

@ApiTags('checkout')
@ApiCookieAuth('cartCookie')
@Controller('checkout')
@Public()
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly idempotencyKeys: IdempotencyKeyPipe,
    private readonly config: ConfigService,
  ) {}

  @Get('draft')
  @UseGuards(CartCapabilityGuard)
  @ApiCookieAuth('guestCheckoutCookie')
  @ApiOperation({
    description:
      'Returns the current private pre-payment draft. Guest access requires both the current cart cookie and the separate checkout capability cookie. Authenticated access remains session-scoped.',
    summary: 'Get the current private checkout draft',
  })
  @ApiOkResponse({ type: CheckoutDraftDto })
  @ApiNotFoundResponse({ description: 'No checkout draft exists for the cart' })
  @ApiUnauthorizedResponse({
    description:
      'Cart or guest-checkout capability is missing, invalid or expired',
  })
  getDraft(@Req() request: CartRequest): Promise<CheckoutDraftDto> {
    return this.checkout.getDraft(
      requireActiveCart(request),
      this.guestCapability(request),
    );
  }

  @Post('draft')
  @HttpCode(200)
  @UseGuards(CartMutationGuard)
  @ApiCookieAuth('guestCheckoutCookie')
  @ApiOperation({
    description:
      'Creates or updates a private pre-payment delivery/contact snapshot without reserving or decrementing stock. The first guest write issues a cookie-only 24-hour capability; later writes require it and never extend its absolute expiry. Guest payment selection is Stripe debit card only; this endpoint does not contact Stripe or create an order.',
    summary: 'Save a private pre-payment checkout draft',
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
      'Retry key scoped to this private checkout draft. Reuse with different input fails.',
    name: 'Idempotency-Key',
    required: true,
    schema: {
      maxLength: 128,
      minLength: 8,
      pattern: '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$',
      type: 'string',
    },
  })
  @ApiBody({ required: true, type: SaveCheckoutDraftDto })
  @ApiOkResponse({
    headers: {
      'Set-Cookie': {
        description:
          'Issued only when a guest draft is first created or safely restarted after expiry. The capability is never returned in JSON.',
        schema: { type: 'string' },
      },
    },
    type: CheckoutDraftDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid or unknown draft input' })
  @ApiUnauthorizedResponse({
    description: 'Cart or existing guest-checkout capability is not valid',
  })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  @ApiConflictResponse({
    description: 'Idempotency key was reused with different canonical input',
  })
  @ApiUnprocessableEntityResponse({
    description: 'Anonymous Cash on Delivery is unavailable',
  })
  @ApiUnsupportedMediaTypeResponse({ description: 'JSON body required' })
  async saveDraft(
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() dto: SaveCheckoutDraftDto,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CheckoutDraftDto> {
    const saved = await this.checkout.saveDraft(
      requireActiveCart(request),
      this.guestCapability(request),
      this.idempotencyKeys.transform(rawIdempotencyKey),
      dto,
    );
    if (saved.issuedCapability) {
      response.setHeader(
        'Set-Cookie',
        createCheckoutCapabilityCookie(
          this.cookieMode(),
          saved.issuedCapability.rawToken,
          saved.issuedCapability.expiresAt,
        ),
      );
    }
    return saved.draft;
  }

  private guestCapability(request: CartRequest): string | null {
    const read = readCheckoutCapabilityCookie(
      request.get('cookie'),
      this.cookieMode(),
    );
    return read.kind === 'present' ? read.rawToken : null;
  }

  private cookieMode(): CheckoutCookieMode {
    return this.config.getOrThrow<CheckoutCookieMode>('CART_COOKIE_MODE');
  }
}

function requireActiveCart(request: CartRequest) {
  if (!request.activeCart) throw new Error('Cart guard invariant failed');
  return request.activeCart;
}
