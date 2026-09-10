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
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiServiceUnavailableResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { CartBodylessMutation } from '../cart/cart-bodyless-mutation.decorator';
import { CartCapabilityGuard } from '../cart/cart-capability.guard';
import { CartMutationGuard } from '../cart/cart-mutation.guard';
import type { CartRequest } from '../cart/cart-request';
import { readCheckoutCapabilityCookie } from '../checkout/checkout-capability-cookie';
import { setCheckoutPrivateHeaders } from '../checkout/checkout-private-headers';
import { IdempotencyKeyPipe } from '../orders/idempotency-key.pipe';
import {
  StartStripeCheckoutDto,
  StripeCheckoutSessionDto,
  StripePaymentStatusDto,
} from './dto/stripe-checkout.dto';
import { StripePaymentService } from './stripe-payment.service';

@ApiTags('payments')
@Controller('payments')
@Public()
export class PaymentsController {
  constructor(
    private readonly payments: StripePaymentService,
    private readonly idempotencyKeys: IdempotencyKeyPipe,
    private readonly config: ConfigService,
  ) {}

  @Post('stripe/checkout-session')
  @UseGuards(CartMutationGuard)
  @ApiSecurity({ cartCookie: [], guestCheckoutCookie: [], sessionCookie: [] })
  @ApiOperation({
    summary: 'Start or resume one Stripe Sandbox hosted Checkout Session',
    description:
      'Creates an immutable server-owned payment attempt before contacting Stripe. The returned hosted URL is private and does not prove payment. Guest access requires the current cart and checkout capabilities.',
  })
  @ApiHeader({ name: 'Origin', required: true })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiHeader({ name: 'Idempotency-Key', required: true })
  @ApiBody({ type: StartStripeCheckoutDto })
  @ApiOkResponse({ type: StripeCheckoutSessionDto })
  @ApiBadRequestResponse({ description: 'Invalid input or idempotency key' })
  @ApiUnauthorizedResponse({ description: 'Private checkout access rejected' })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  @ApiConflictResponse({ description: 'Attempt is not safely resumable' })
  @ApiUnprocessableEntityResponse({
    description: 'Quote or stock is unavailable',
  })
  @ApiServiceUnavailableResponse({
    description: 'Stripe Sandbox is unavailable or disabled',
  })
  async start(
    @Headers('idempotency-key') rawIdempotencyKey: string | undefined,
    @Body() dto: StartStripeCheckoutDto,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StripeCheckoutSessionDto> {
    setCheckoutPrivateHeaders(response);
    return this.payments.startCheckout({
      cart: requireActiveCart(request),
      checkoutDraftId: dto.checkoutDraftId,
      idempotencyKey: this.idempotencyKeys.transform(rawIdempotencyKey),
      rawGuestCapability: checkoutCapability(request, this.config),
    });
  }

  @Get('stripe/status')
  @UseGuards(CartCapabilityGuard)
  @ApiSecurity({ cartCookie: [], guestCheckoutCookie: [], sessionCookie: [] })
  @ApiOkResponse({ type: StripePaymentStatusDto })
  @ApiUnauthorizedResponse({ description: 'Private checkout access rejected' })
  async status(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StripePaymentStatusDto> {
    setCheckoutPrivateHeaders(response);
    return this.payments.currentStatus(
      requireActiveCart(request),
      checkoutCapability(request, this.config),
    );
  }

  @Post('stripe/reconcile')
  @HttpCode(200)
  @CartBodylessMutation()
  @UseGuards(CartMutationGuard)
  @ApiSecurity({ cartCookie: [], guestCheckoutCookie: [], sessionCookie: [] })
  @ApiHeader({ name: 'Origin', required: true })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiOkResponse({ type: StripePaymentStatusDto })
  @ApiUnauthorizedResponse({ description: 'Private checkout access rejected' })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  @ApiServiceUnavailableResponse({
    description: 'Provider state remains unknown',
  })
  async reconcile(
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StripePaymentStatusDto> {
    setCheckoutPrivateHeaders(response);
    return this.payments.reconcile(
      requireActiveCart(request),
      checkoutCapability(request, this.config),
    );
  }

  @Post('stripe/webhook')
  @HttpCode(200)
  @ApiHeader({ name: 'Stripe-Signature', required: true })
  @ApiOkResponse({ description: 'Verified event accepted or replayed' })
  @ApiBadRequestResponse({
    description: 'Signature or event contract rejected',
  })
  async webhook(
    @Headers('stripe-signature') signature: string | undefined,
    @Req() request: RawBodyRequest<Request>,
  ): Promise<{ received: true }> {
    await this.payments.acceptWebhook(request.rawBody, signature);
    return { received: true };
  }
}

function requireActiveCart(request: CartRequest) {
  if (!request.activeCart) throw new Error('Cart guard invariant failed');
  return request.activeCart;
}

function checkoutCapability(
  request: CartRequest,
  config: ConfigService,
): string | null {
  const mode = config.getOrThrow<'local-http' | 'secure-https'>(
    'CART_COOKIE_MODE',
  );
  const read = readCheckoutCapabilityCookie(request.get('cookie'), mode);
  return read.kind === 'present' ? read.rawToken : null;
}
