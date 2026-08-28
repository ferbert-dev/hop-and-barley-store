import { SessionService } from './session.service';

jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

const USER_ID = '10000000-0000-4000-8000-000000000001';
const SESSION_ID = '20000000-0000-4000-8000-000000000001';
const RAW_TOKEN = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const PREVIOUS_TOKEN = 'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const NOW = new Date('2026-08-22T10:00:00.000Z');
const CREDENTIAL_CHANGED_AT = new Date('2026-08-20T10:00:00.000Z');

type SessionCreateData = Readonly<{
  credentialChangedAtAtIssue: Date;
  expiresAt: Date;
  issuedAt: Date;
  lastSeenAt: Date;
  roleAtIssue: 'CUSTOMER';
  tokenHash: Uint8Array<ArrayBuffer>;
  userId: string;
}>;

type SessionCreateArgs = Readonly<{
  data: SessionCreateData;
  select: Readonly<{
    expiresAt: boolean;
    id: boolean;
    issuedAt: boolean;
    lastSeenAt: boolean;
  }>;
}>;

type SessionMutationArgs = Readonly<{
  data: Readonly<{ lastSeenAt?: Date; revokedAt?: Date }>;
  where: Readonly<Record<string, unknown>>;
}>;

type ActiveSessionUser = Readonly<{
  id: string;
  passwordCredential: Readonly<{ changedAt: Date }> | null;
  role: 'ADMIN' | 'CUSTOMER';
  status: 'ACTIVE' | 'DISABLED';
}>;

type ActiveSessionRow = Readonly<{
  credentialChangedAtAtIssue: Date;
  expiresAt: Date;
  id: string;
  issuedAt: Date;
  lastSeenAt: Date;
  revokedAt: Date | null;
  roleAtIssue: 'CUSTOMER';
  user: ActiveSessionUser;
}>;

type ActiveSessionOverride = Partial<Omit<ActiveSessionRow, 'user'>> &
  Readonly<{ user?: Partial<ActiveSessionUser> }>;

const STALE_SESSION_OVERRIDES: readonly ActiveSessionOverride[] = [
  { expiresAt: NOW },
  { lastSeenAt: new Date('2026-08-21T10:00:00.000Z') },
  { revokedAt: new Date('2026-08-22T09:00:00.000Z') },
  { user: { status: 'DISABLED' } },
  { user: { role: 'ADMIN' } },
  {
    user: {
      passwordCredential: {
        changedAt: new Date('2026-08-22T09:00:00.000Z'),
      },
    },
  },
];

describe('SessionService', () => {
  it('issues a hash-only seven-day session under a User lock and Serializable transaction', async () => {
    const { prisma, transaction } = createPrisma();
    const service = new SessionService(prisma as never);

    const result = await service.issue(USER_ID, PREVIOUS_TOKEN, { now: NOW });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 2_000,
      timeout: 5_000,
    });
    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    const createArgs = transaction.authSession.create.mock.calls[0]?.[0];
    expect(createArgs).toBeDefined();
    if (!createArgs) throw new Error('Expected a session create call');
    expect(createArgs.data).toMatchObject({
      credentialChangedAtAtIssue: CREDENTIAL_CHANGED_AT,
      expiresAt: new Date('2026-08-29T10:00:00.000Z'),
      issuedAt: NOW,
      lastSeenAt: NOW,
      roleAtIssue: 'CUSTOMER',
      userId: USER_ID,
    });
    expect(createArgs.select).toEqual({
      expiresAt: true,
      id: true,
      issuedAt: true,
      lastSeenAt: true,
    });
    expect(createArgs.data).not.toHaveProperty('rawToken');
    expect(createArgs.data.tokenHash).toBeInstanceOf(Uint8Array);
    expect(Buffer.from(createArgs.data.tokenHash)).toHaveLength(32);
    expect(result.rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result).toMatchObject({
      expiresAt: new Date('2026-08-29T10:00:00.000Z'),
      role: 'CUSTOMER',
      status: 'ACTIVE',
      userId: USER_ID,
    });
  });

  it('extends only a remembered session to the exact 30-day absolute expiry', async () => {
    const { prisma, transaction } = createPrisma();
    const service = new SessionService(prisma as never);

    const result = await service.issue(USER_ID, null, {
      now: NOW,
      rememberMe: true,
    });

    const createArgs = transaction.authSession.create.mock.calls[0]?.[0];
    expect(createArgs?.data.expiresAt).toEqual(
      new Date('2026-09-21T10:00:00.000Z'),
    );
    expect(result.expiresAt).toEqual(new Date('2026-09-21T10:00:00.000Z'));
  });

  it('rotates a presented same-user session and revokes the oldest above five', async () => {
    const { prisma, transaction } = createPrisma();
    transaction.authSession.findMany.mockResolvedValue(
      Array.from({ length: 5 }, (_, index) => ({ id: `old-${index}` })),
    );
    const service = new SessionService(prisma as never);

    await service.issue(USER_ID, PREVIOUS_TOKEN, { now: NOW });

    const rotateArgs = transaction.authSession.updateMany.mock.calls[0]?.[0];
    const overflowArgs = transaction.authSession.updateMany.mock.calls[1]?.[0];
    expect(rotateArgs).toMatchObject({
      data: { revokedAt: NOW },
      where: { userId: USER_ID },
    });
    expect(overflowArgs).toEqual({
      data: { revokedAt: NOW },
      where: { id: { in: ['old-0'] }, revokedAt: null },
    });
  });

  it('retries only bounded P2034 conflicts with full-jitter exponential backoff', async () => {
    const { prisma } = createPrisma();
    const random = jest.spyOn(Math, 'random').mockReturnValue(0.5);
    const timeout = jest.spyOn(globalThis, 'setTimeout');
    prisma.$transaction
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockRejectedValueOnce({ code: 'P2034' });
    const service = new SessionService(prisma as never);

    try {
      await expect(
        service.issue(USER_ID, null, { now: NOW }),
      ).resolves.toBeDefined();
      expect(prisma.$transaction).toHaveBeenCalledTimes(3);
      expect(timeout).toHaveBeenNthCalledWith(1, expect.any(Function), 3);
      expect(timeout).toHaveBeenNthCalledWith(2, expect.any(Function), 5);

      prisma.$transaction.mockClear().mockRejectedValue({ code: 'P2002' });
      await expect(
        service.issue(USER_ID, null, { now: NOW }),
      ).rejects.toMatchObject({ code: 'P2002' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      prisma.$transaction.mockClear().mockRejectedValue({ code: 'P2034' });
      await expect(
        service.issue(USER_ID, null, { now: NOW }),
      ).rejects.toMatchObject({ code: 'P2034' });
      expect(prisma.$transaction).toHaveBeenCalledTimes(8);
    } finally {
      random.mockRestore();
      timeout.mockRestore();
    }
  });

  it('authenticates current state and coalesces activity with a no-resurrection update', async () => {
    const { prisma } = createPrisma();
    prisma.authSession.findUnique.mockResolvedValue(
      activeSession({ lastSeenAt: new Date('2026-08-22T09:40:00.000Z') }),
    );
    prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
    const service = new SessionService(prisma as never);

    const result = await service.authenticate(RAW_TOKEN, NOW);

    const touchArgs = prisma.authSession.updateMany.mock.calls[0]?.[0];
    expect(touchArgs).toEqual({
      data: { lastSeenAt: NOW },
      where: {
        expiresAt: { gt: NOW },
        id: SESSION_ID,
        lastSeenAt: {
          gt: new Date('2026-08-21T10:00:00.000Z'),
          lte: new Date('2026-08-22T09:45:00.000Z'),
        },
        revokedAt: null,
      },
    });
    expect(result).toMatchObject({
      lastSeenAt: NOW,
      rawToken: RAW_TOKEN,
      role: 'CUSTOMER',
      sessionId: SESSION_ID,
      status: 'ACTIVE',
      userId: USER_ID,
    });
  });

  it.each(STALE_SESSION_OVERRIDES)(
    'fails closed for stale session state %#',
    async (override) => {
      const { prisma } = createPrisma();
      prisma.authSession.findUnique.mockResolvedValue(activeSession(override));
      const service = new SessionService(prisma as never);

      await expect(service.authenticate(RAW_TOKEN, NOW)).resolves.toBeNull();
      expect(prisma.authSession.updateMany).not.toHaveBeenCalled();
    },
  );

  it('revokes all sessions under the same deterministic User lock', async () => {
    const { prisma, transaction } = createPrisma();
    const service = new SessionService(prisma as never);

    await expect(service.revokeAll(USER_ID, NOW)).resolves.toBe(1);

    expect(transaction.$queryRaw).toHaveBeenCalledTimes(1);
    expect(transaction.authSession.updateMany).toHaveBeenCalledWith({
      data: { revokedAt: NOW },
      where: { userId: USER_ID, revokedAt: null },
    });
  });
});

function createPrisma() {
  const transaction = {
    $queryRaw: jest
      .fn<Promise<Array<{ id: string }>>, unknown[]>()
      .mockResolvedValue([{ id: USER_ID }]),
    authSession: {
      create: jest
        .fn<
          Promise<
            Pick<
              ActiveSessionRow,
              'expiresAt' | 'id' | 'issuedAt' | 'lastSeenAt'
            >
          >,
          [SessionCreateArgs]
        >()
        .mockImplementation(({ data }) =>
          Promise.resolve({
            expiresAt: data.expiresAt,
            id: SESSION_ID,
            issuedAt: data.issuedAt,
            lastSeenAt: data.lastSeenAt,
          }),
        ),
      findMany: jest
        .fn<Promise<Array<{ id: string }>>, [args?: unknown]>()
        .mockResolvedValue([]),
      updateMany: jest
        .fn<Promise<{ count: number }>, [SessionMutationArgs]>()
        .mockResolvedValue({ count: 1 }),
    },
    user: {
      findUnique: jest
        .fn<
          Promise<Pick<
            ActiveSessionUser,
            'id' | 'passwordCredential' | 'role' | 'status'
          > | null>,
          [args?: unknown]
        >()
        .mockResolvedValue({
          id: USER_ID,
          passwordCredential: { changedAt: CREDENTIAL_CHANGED_AT },
          role: 'CUSTOMER',
          status: 'ACTIVE',
        }),
    },
  };
  type TransactionOperation = (
    transactionClient: typeof transaction,
  ) => Promise<unknown>;
  const prisma = {
    $transaction: jest
      .fn<Promise<unknown>, [TransactionOperation, options?: unknown]>()
      .mockImplementation((callback) => callback(transaction)),
    authSession: {
      findUnique: jest.fn<Promise<ActiveSessionRow | null>, [args?: unknown]>(),
      updateMany: jest.fn<Promise<{ count: number }>, [SessionMutationArgs]>(),
    },
  };
  return { prisma, transaction };
}

function activeSession(override: ActiveSessionOverride = {}): ActiveSessionRow {
  const base: ActiveSessionRow = {
    credentialChangedAtAtIssue: CREDENTIAL_CHANGED_AT,
    expiresAt: new Date('2026-08-29T10:00:00.000Z'),
    id: SESSION_ID,
    issuedAt: new Date('2026-08-22T09:00:00.000Z'),
    lastSeenAt: new Date('2026-08-22T09:50:00.000Z'),
    revokedAt: null,
    roleAtIssue: 'CUSTOMER',
    user: {
      id: USER_ID,
      passwordCredential: { changedAt: CREDENTIAL_CHANGED_AT },
      role: 'CUSTOMER',
      status: 'ACTIVE',
    },
  };
  return {
    ...base,
    ...override,
    user: { ...base.user, ...override.user },
  };
}
