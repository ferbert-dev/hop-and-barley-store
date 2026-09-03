import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiCookieAuth,
  ApiForbiddenResponse,
  ApiHeader,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiUnauthorizedResponse,
  ApiUnsupportedMediaTypeResponse,
  ApiUnprocessableEntityResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { AllowCartBootstrap } from './cart-bootstrap.decorator';
import { CartBodylessMutation } from './cart-bodyless-mutation.decorator';
import { CartCapabilityGuard } from './cart-capability.guard';
import type { CartCookieMode } from './cart-cookie';
import { createCartCookie } from './cart-cookie';
import { CartCsrfService } from './cart-csrf.service';
import { CartMutationGuard } from './cart-mutation.guard';
import type { CartRequest } from './cart-request';
import { CartService } from './cart.service';
import { CartAccessService } from './cart-access.service';
import { CsrfService } from '../auth/session/csrf.service';
import {
  AddCartItemDto,
  CartProductSlugDto,
  UpdateCartItemDto,
} from './dto/cart-mutation.dto';
import {
  CartCsrfResponseDto,
  CartDto,
  CheckoutReadinessDto,
} from './dto/cart-response.dto';

const UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });

@ApiTags('cart')
@Controller('cart')
@Public()
export class CartController {
  constructor(
    private readonly carts: CartService,
    private readonly access: CartAccessService,
    private readonly csrf: CartCsrfService,
    private readonly sessionCsrf: CsrfService,
    private readonly config: ConfigService,
  ) {}

  @Get()
  @ApiOperation({
    description:
      'Read-only. A request without the configured cart cookie returns an empty cart and never creates database state or a cookie.',
    summary: 'Get the current guest cart',
  })
  @ApiOkResponse({ type: CartDto })
  @ApiUnauthorizedResponse({
    description: 'Presented cart capability is not valid',
  })
  async get(@Req() request: CartRequest): Promise<CartDto> {
    const resolved = await this.access.resolve(request.get('cookie'));
    if (resolved.kind === 'absent' || resolved.kind === 'account_absent') {
      return this.carts.empty();
    }
    if (resolved.kind === 'invalid')
      throw new UnauthorizedException(UNAUTHORIZED);
    return this.carts.getCart(resolved.access);
  }

  @Get('csrf')
  @UseGuards(CartCapabilityGuard)
  @ApiCookieAuth('cartCookie')
  @ApiOkResponse({ type: CartCsrfResponseDto })
  @ApiUnauthorizedResponse({
    description: 'Presented cart capability is not valid',
  })
  csrfToken(@Req() request: CartRequest): CartCsrfResponseDto {
    const cart = requireActiveCart(request);
    return {
      csrfToken:
        cart.kind === 'account'
          ? this.sessionCsrf.issue(cart.rawToken)
          : this.csrf.issue(cart.rawToken),
    };
  }

  @Post('checkout-readiness')
  @HttpCode(200)
  @CartBodylessMutation()
  @UseGuards(CartMutationGuard)
  @ApiCookieAuth('cartCookie')
  @ApiOperation({
    description:
      'Checks every retained cart line against current product, amount, price and stock state without reserving or changing inventory. Business shortages are returned as safe line outcomes.',
    summary: 'Check whether the current cart is ready for checkout',
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
  @ApiOkResponse({ type: CheckoutReadinessDto })
  @ApiUnauthorizedResponse({
    description: 'Presented cart capability is not valid',
  })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  checkoutReadiness(
    @Req() request: CartRequest,
  ): Promise<CheckoutReadinessDto> {
    return this.carts.checkoutReadiness(requireActiveCart(request));
  }

  @Post('items')
  @HttpCode(200)
  @AllowCartBootstrap()
  @UseGuards(CartMutationGuard)
  @ApiOperation({
    description:
      'With no configured cart cookie, exact Origin bootstraps the first cart after validation succeeds. Any presented cart cookie disables bootstrap and requires a valid cart-bound CSRF token.',
    summary: 'Add a sellable product amount to the guest cart',
  })
  @ApiBody({ required: true, type: AddCartItemDto })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader({
    description: 'Required whenever the configured cart cookie is present.',
    name: 'X-CSRF-Token',
    required: false,
    schema: {
      pattern: '^[A-Za-z0-9_-]{1,16}\\.[A-Za-z0-9_-]{43}$',
      type: 'string',
    },
  })
  @ApiOkResponse({
    headers: {
      'Set-Cookie': {
        description: 'Set only after a successful first-cart bootstrap.',
        schema: { type: 'string' },
      },
    },
    type: CartDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid body' })
  @ApiUnauthorizedResponse({
    description: 'Presented cart capability is not valid',
  })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  @ApiUnsupportedMediaTypeResponse({ description: 'JSON body required' })
  @ApiUnprocessableEntityResponse({
    description: 'Product, amount or line limit is unavailable',
  })
  async add(
    @Body() dto: AddCartItemDto,
    @Req() request: CartRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CartDto> {
    if (request.cartBootstrap) {
      const created = await this.carts.createAndAdd(dto);
      response.setHeader(
        'Set-Cookie',
        createCartCookie(
          this.cookieMode(),
          created.rawToken,
          created.expiresAt,
        ),
      );
      return created.cart;
    }
    return this.carts.add(requireActiveCart(request), dto);
  }

  @Patch('items/:productSlug')
  @UseGuards(CartMutationGuard)
  @ApiCookieAuth('cartCookie')
  @ApiBody({ required: true, type: UpdateCartItemDto })
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    schema: {
      pattern: '^[A-Za-z0-9_-]{1,16}\\.[A-Za-z0-9_-]{43}$',
      type: 'string',
    },
  })
  @ApiParam({
    name: 'productSlug',
    schema: { pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: 'string' },
  })
  @ApiOkResponse({ type: CartDto })
  @ApiBadRequestResponse({ description: 'Invalid body or product slug' })
  @ApiUnauthorizedResponse({
    description: 'Presented cart capability is not valid',
  })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  @ApiNotFoundResponse({ description: 'Cart line not found' })
  @ApiUnprocessableEntityResponse({
    description: 'Product or amount is unavailable',
  })
  update(
    @Param() { productSlug }: CartProductSlugDto,
    @Body() dto: UpdateCartItemDto,
    @Req() request: CartRequest,
  ): Promise<CartDto> {
    return this.carts.update(requireActiveCart(request), productSlug, dto);
  }

  @Delete('items/:productSlug')
  @UseGuards(CartMutationGuard)
  @ApiCookieAuth('cartCookie')
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    schema: {
      pattern: '^[A-Za-z0-9_-]{1,16}\\.[A-Za-z0-9_-]{43}$',
      type: 'string',
    },
  })
  @ApiParam({
    name: 'productSlug',
    schema: { pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', type: 'string' },
  })
  @ApiOkResponse({ type: CartDto })
  @ApiUnauthorizedResponse({
    description: 'Presented cart capability is not valid',
  })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  @ApiNotFoundResponse({ description: 'Cart line not found' })
  remove(
    @Param() { productSlug }: CartProductSlugDto,
    @Req() request: CartRequest,
  ): Promise<CartDto> {
    return this.carts.remove(requireActiveCart(request), productSlug);
  }

  @Delete('items')
  @UseGuards(CartMutationGuard)
  @ApiCookieAuth('cartCookie')
  @ApiHeader({ name: 'Origin', required: true, schema: { type: 'string' } })
  @ApiHeader({
    name: 'X-CSRF-Token',
    required: true,
    schema: {
      pattern: '^[A-Za-z0-9_-]{1,16}\\.[A-Za-z0-9_-]{43}$',
      type: 'string',
    },
  })
  @ApiOkResponse({ type: CartDto })
  @ApiUnauthorizedResponse({
    description: 'Presented cart capability is not valid',
  })
  @ApiForbiddenResponse({ description: 'Origin or CSRF is not valid' })
  clear(@Req() request: CartRequest): Promise<CartDto> {
    return this.carts.clear(requireActiveCart(request));
  }

  private cookieMode(): CartCookieMode {
    return this.config.getOrThrow<CartCookieMode>('CART_COOKIE_MODE');
  }
}

function requireActiveCart(request: CartRequest) {
  if (!request.activeCart) throw new Error('Cart guard invariant failed');
  return request.activeCart;
}
