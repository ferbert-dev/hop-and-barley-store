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
  ApiBody,
  ApiForbiddenResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { Public } from '../auth/public.decorator';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { CartMutationGuard } from '../cart/cart-mutation.guard';
import type { CartRequest } from '../cart/cart-request';
import { readCheckoutCapabilityCookie } from '../checkout/checkout-capability-cookie';
import { setCheckoutPrivateHeaders } from '../checkout/checkout-private-headers';
import { CreatePurchaseLikeDto } from './dto/create-purchase-like.dto';
import {
  PurchaseLikeCountDto,
  PurchaseLikeResponseDto,
} from './dto/purchase-like-count.dto';
import { LikesService } from './likes.service';

@ApiTags('likes')
@Controller('likes')
@Public()
export class LikesController {
  constructor(
    private readonly likes: LikesService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the public completed-purchase Like count' })
  @ApiOkResponse({ type: PurchaseLikeCountDto })
  count(): Promise<PurchaseLikeCountDto> {
    return this.likes.count();
  }

  @Post()
  @HttpCode(200)
  @UseGuards(CartMutationGuard)
  @ApiSecurity({ cartCookie: [], guestCheckoutCookie: [], sessionCookie: [] })
  @ApiOperation({
    summary: 'Record the Like earned by one completed Stripe Sandbox purchase',
    description:
      'The opaque payment attempt ID is checked server-side against its exact paid Stripe Sandbox order and the caller’s private cart/checkout capability. Retries are idempotent.',
  })
  @ApiHeader({ name: 'Origin', required: true })
  @ApiHeader({ name: 'X-CSRF-Token', required: true })
  @ApiBody({ type: CreatePurchaseLikeDto })
  @ApiOkResponse({ type: PurchaseLikeResponseDto })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  @ApiUnprocessableEntityResponse({
    description: 'The supplied purchase is absent or not eligible to Like',
  })
  create(
    @Body() dto: CreatePurchaseLikeDto,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<PurchaseLikeResponseDto> {
    setCheckoutPrivateHeaders(response);
    if (!request.activeCart) throw new Error('Cart guard invariant failed');
    const mode = this.config.getOrThrow<'local-http' | 'secure-https'>(
      'CART_COOKIE_MODE',
    );
    const capability = readCheckoutCapabilityCookie(
      request.get('cookie'),
      mode,
    );
    return this.likes.create(
      dto.paymentAttemptId,
      request.activeCart,
      capability.kind === 'present' ? capability.rawToken : null,
    );
  }
}
