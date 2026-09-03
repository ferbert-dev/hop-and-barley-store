import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { CartService } from '../cart/cart.service';
import { AuthController } from './auth.controller';
import { CsrfService } from './session/csrf.service';
import { LoginService } from './login.service';
import { LoginRequestGuard } from './login-request.guard';
import { RegistrationRequestGuard } from './registration-request.guard';
import { RegistrationService } from './registration.service';
import { SessionService } from './session/session.service';

jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

const rawSession = 'A'.repeat(43);
const rawGuest = 'A'.repeat(43);
const activeSession = {
  expiresAt: new Date('2026-09-10T12:00:00.000Z'),
  issuedAt: new Date('2026-09-03T12:00:00.000Z'),
  lastSeenAt: new Date('2026-09-03T12:00:00.000Z'),
  rawToken: rawSession,
  role: 'CUSTOMER' as const,
  sessionId: 'session-1',
  status: 'ACTIVE' as const,
  userId: 'user-1',
};

describe('AuthController cart merge handoff', () => {
  const login = { login: jest.fn() };
  const carts = { mergeGuestIntoAccount: jest.fn() };
  let controller: AuthController;

  beforeEach(async () => {
    jest.resetAllMocks();
    login.login.mockResolvedValue(activeSession);
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: RegistrationService, useValue: {} },
        { provide: LoginService, useValue: login },
        { provide: CartService, useValue: carts },
        { provide: SessionService, useValue: {} },
        { provide: CsrfService, useValue: {} },
        {
          provide: ConfigService,
          useValue: { getOrThrow: jest.fn(() => 'local-http') },
        },
      ],
    })
      .overrideGuard(RegistrationRequestGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(LoginRequestGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(AuthController);
  });

  it('keeps authentication successful and retains the guest cookie on merge failure', async () => {
    carts.mergeGuestIntoAccount.mockRejectedValue(new Error('storage'));
    const response = { setHeader: jest.fn() };

    await expect(
      controller.login(
        { email: 'brewer@example.com', password: 'safe', rememberMe: false },
        requestWithGuestCookie() as never,
        response as never,
      ),
    ).resolves.toMatchObject({ cartMerge: 'unavailable' });
    expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', [
      expect.stringContaining(`hb_session=${rawSession}`),
    ]);
  });

  it('clears the consumed guest capability only after merge succeeds', async () => {
    carts.mergeGuestIntoAccount.mockResolvedValue('succeeded');
    const response = { setHeader: jest.fn() };

    await expect(
      controller.login(
        { email: 'brewer@example.com', password: 'safe', rememberMe: false },
        requestWithGuestCookie() as never,
        response as never,
      ),
    ).resolves.toMatchObject({ cartMerge: 'succeeded' });
    expect(response.setHeader).toHaveBeenCalledWith('Set-Cookie', [
      expect.stringContaining(`hb_session=${rawSession}`),
      expect.stringContaining('hb_cart=; Max-Age=0'),
    ]);
  });
});

function requestWithGuestCookie() {
  return {
    get: (name: string) =>
      name.toLowerCase() === 'cookie' ? `hb_cart=${rawGuest}` : undefined,
  };
}
