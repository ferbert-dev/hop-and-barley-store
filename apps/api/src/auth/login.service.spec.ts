import { UnauthorizedException } from '@nestjs/common';
import { LoginService, UNKNOWN_ACCOUNT_PHC } from './login.service';
import type { ActiveSession } from './session/session.service';

jest.mock('../database/prisma.service', () => ({ PrismaService: class {} }));

const USER_ID = '10000000-0000-4000-8000-000000000001';
const PASSWORD_HASH = '$argon2id$v=19$m=7168,p=1,t=5$salt$hash';

describe('LoginService', () => {
  it('performs exactly one dummy verify for an unknown email', async () => {
    const fixture = createFixture(null, false);

    const failure = await captureFailure(
      fixture.service.login(
        {
          email: 'unknown@example.com',
          password: 'unknown-password-value',
          rememberMe: false,
        },
        null,
      ),
    );

    expect(fixture.hasher.verify).toHaveBeenCalledTimes(1);
    expect(UNKNOWN_ACCOUNT_PHC).toMatch(/^\$argon2id\$v=19\$m=7168,p=1,t=5\$/);
    expect(fixture.hasher.verify).toHaveBeenCalledWith(
      UNKNOWN_ACCOUNT_PHC,
      'unknown-password-value',
    );
    expect(failure).toEqual({ status: 'unauthorized' });
    expect(fixture.sessions.issue).not.toHaveBeenCalled();
  });

  it('returns byte-identical failures after one verify for wrong password and disabled user', async () => {
    const wrong = createFixture(activeUser(), false);
    const disabled = createFixture(activeUser({ status: 'DISABLED' }), true);

    const wrongFailure = await captureFailure(
      wrong.service.login(
        {
          email: 'brewer@example.com',
          password: 'wrong-password-value',
          rememberMe: false,
        },
        null,
      ),
    );
    const disabledFailure = await captureFailure(
      disabled.service.login(
        {
          email: 'brewer@example.com',
          password: 'correct-password-value',
          rememberMe: false,
        },
        null,
      ),
    );

    expect(wrong.hasher.verify).toHaveBeenCalledTimes(1);
    expect(disabled.hasher.verify).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(wrongFailure)).toBe(JSON.stringify(disabledFailure));
    expect(disabled.sessions.issue).not.toHaveBeenCalled();
  });

  it('issues and rotates only after an active credential verifies', async () => {
    const fixture = createFixture(activeUser(), true);
    const previous = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

    const result = await fixture.service.login(
      {
        email: 'Brewer@Example.com',
        password: 'correct-password-value',
        rememberMe: true,
      },
      previous,
    );

    expect(fixture.hasher.verify).toHaveBeenCalledWith(
      PASSWORD_HASH,
      'correct-password-value',
    );
    expect(fixture.sessions.issue).toHaveBeenCalledWith(USER_ID, previous, {
      rememberMe: true,
    });
    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.userId).toBe(USER_ID);
  });

  it('verifies the same NFC password representation used at registration', async () => {
    const fixture = createFixture(activeUser(), true);

    await fixture.service.login(
      {
        email: 'brewer@example.com',
        password: 'Cafe\u0301-Long-Passphrase',
        rememberMe: false,
      },
      null,
    );

    expect(fixture.hasher.verify).toHaveBeenCalledWith(
      PASSWORD_HASH,
      'Café-Long-Passphrase',
    );
  });

  it('uses a non-reversible account bucket key independent from the IP bucket', async () => {
    const fixture = createFixture(activeUser(), true);

    await fixture.service.login(
      {
        email: 'Brewer@Example.com',
        password: 'correct-password-value',
        rememberMe: false,
      },
      null,
    );

    expect(fixture.rateLimiter.consumeAccount).toHaveBeenCalledWith(
      expect.stringMatching(/^[a-f0-9]{64}$/),
    );
    expect(fixture.rateLimiter.consumeAccount).not.toHaveBeenCalledWith(
      'brewer@example.com',
    );
  });
});

function createFixture(
  user: ReturnType<typeof activeUser> | null,
  verified: boolean,
) {
  const prisma = { user: { findUnique: jest.fn().mockResolvedValue(user) } };
  const hasher = {
    verify: jest
      .fn<Promise<boolean>, [passwordHash: string, password: string]>()
      .mockResolvedValue(verified),
  };
  const sessions = {
    issue: jest
      .fn<
        Promise<ActiveSession>,
        [
          userId: string,
          presented: string | null,
          options: { rememberMe: boolean },
        ]
      >()
      .mockResolvedValue({
        expiresAt: new Date('2026-08-29T10:00:00.000Z'),
        issuedAt: new Date('2026-08-22T10:00:00.000Z'),
        lastSeenAt: new Date('2026-08-22T10:00:00.000Z'),
        rawToken: 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        role: 'CUSTOMER',
        sessionId: '20000000-0000-4000-8000-000000000001',
        userId: USER_ID,
      }),
  };
  const rateLimiter = {
    consumeAccount: jest
      .fn<boolean, [accountKey: string]>()
      .mockReturnValue(true),
  };
  return {
    hasher,
    rateLimiter,
    service: new LoginService(
      prisma as never,
      hasher as never,
      sessions as never,
      rateLimiter as never,
    ),
    sessions,
  };
}

function activeUser(override: Record<string, unknown> = {}) {
  return {
    id: USER_ID,
    passwordCredential: { passwordHash: PASSWORD_HASH },
    role: 'CUSTOMER',
    status: 'ACTIVE',
    ...override,
  };
}

async function captureFailure(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error('Expected login to fail');
  } catch (error) {
    expect(error).toBeInstanceOf(UnauthorizedException);
    return (error as UnauthorizedException).getResponse();
  }
}
