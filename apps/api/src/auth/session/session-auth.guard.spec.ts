import {
  Logger,
  ServiceUnavailableException,
  type ExecutionContext,
} from '@nestjs/common';
import { SessionAuthGuard } from './session-auth.guard';

jest.mock('../../database/prisma.service', () => ({ PrismaService: class {} }));

describe('SessionAuthGuard default deny', () => {
  beforeEach(() => {
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('allows only explicit public metadata without consulting session state', async () => {
    const { context, reflector, response, sessions } = createDependencies();
    reflector.getAllAndOverride.mockReturnValue(true);
    const guard = createGuard({ reflector, sessions });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(sessions.authenticate).not.toHaveBeenCalled();
    expect(response.setHeader).not.toHaveBeenCalled();
  });

  it('fails an unmarked route closed when the rollback flag is disabled', async () => {
    const { config, context, reflector, response, sessions } =
      createDependencies();
    config.get.mockImplementation((key: string) =>
      key === 'AUTH_SESSIONS_ENABLED' ? false : undefined,
    );
    const guard = createGuard({ config, reflector, sessions });

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'private, no-store',
    );
    expect(response.setHeader).toHaveBeenCalledWith('Vary', 'Cookie, Origin');
    expect(sessions.authenticate).not.toHaveBeenCalled();
  });
});

function createGuard(overrides: {
  config?: ReturnType<typeof createDependencies>['config'];
  reflector: ReturnType<typeof createDependencies>['reflector'];
  sessions: ReturnType<typeof createDependencies>['sessions'];
}) {
  const fallback = createDependencies();
  return new SessionAuthGuard(
    overrides.reflector as never,
    (overrides.config ?? fallback.config) as never,
    overrides.sessions as never,
    fallback.origin as never,
    fallback.csrf as never,
  );
}

function createDependencies() {
  const request = {
    authRequestId: 'safe-request-id',
    get: jest.fn(),
    method: 'GET',
  };
  const response = { setHeader: jest.fn() };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };
  const config = { get: jest.fn().mockReturnValue(true) };
  const sessions = { authenticate: jest.fn() };
  const origin = { assertExact: jest.fn() };
  const csrf = { verify: jest.fn() };
  const context = {
    getClass: jest.fn(),
    getHandler: jest.fn(),
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
  return {
    config,
    context,
    csrf,
    origin,
    reflector,
    request,
    response,
    sessions,
  };
}
