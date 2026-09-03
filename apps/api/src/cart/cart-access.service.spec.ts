import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { SessionService } from '../auth/session/session.service';
import { CartAccessService } from './cart-access.service';
import { CartService } from './cart.service';

jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

describe('CartAccessService', () => {
  const sessionCookie = `hb_session=${'A'.repeat(43)}`;
  const cartCookie = `hb_cart=${'A'.repeat(43)}`;
  const sessions = { authenticate: jest.fn() };
  const carts = {
    authenticate: jest.fn(),
    authenticateAccount: jest.fn(),
    createAccountCart: jest.fn(),
  };
  let access: CartAccessService;

  beforeEach(async () => {
    jest.resetAllMocks();
    const module = await Test.createTestingModule({
      providers: [
        CartAccessService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(() => true),
            getOrThrow: jest.fn((name: string) =>
              name === 'AUTH_COOKIE_MODE' ? 'local-http' : 'local-http',
            ),
          },
        },
        { provide: SessionService, useValue: sessions },
        { provide: CartService, useValue: carts },
      ],
    }).compile();
    access = module.get(CartAccessService);
  });

  it('prefers the server-authenticated account cart over a guest cookie', async () => {
    sessions.authenticate.mockResolvedValue({
      rawToken: 'session-token',
      userId: 'user-1',
    });
    carts.authenticateAccount.mockResolvedValue({
      cartId: 'account-cart',
      kind: 'account',
      rawToken: 'session-token',
      userId: 'user-1',
    });

    const result = await access.resolve(`${sessionCookie}; ${cartCookie}`);

    expect(result.kind).toBe('present');
    if (result.kind === 'present') {
      expect(result.access.cartId).toBe('account-cart');
    }
    expect(carts.authenticate).not.toHaveBeenCalled();
  });

  it('retains authenticated identity when the account cart is not created yet', async () => {
    sessions.authenticate.mockResolvedValue({
      rawToken: 'session-token',
      userId: 'user-1',
    });
    carts.authenticateAccount.mockResolvedValue(null);

    await expect(
      access.resolve(`${sessionCookie}; ${cartCookie}`),
    ).resolves.toEqual({
      kind: 'account_absent',
      rawToken: 'A'.repeat(43),
      userId: 'user-1',
    });
    expect(carts.authenticate).not.toHaveBeenCalled();
  });

  it('resolves a guest capability when no valid session is present', async () => {
    sessions.authenticate.mockResolvedValue(null);
    carts.authenticate.mockResolvedValue({ cartId: 'guest-cart' });

    await expect(access.resolve(cartCookie)).resolves.toEqual({
      access: { cartId: 'guest-cart' },
      kind: 'present',
    });
  });
});
