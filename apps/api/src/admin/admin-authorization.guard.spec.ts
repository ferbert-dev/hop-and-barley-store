import {
  ForbiddenException,
  type ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ADMIN_ONLY_KEY,
  AdminAuthorizationGuard,
} from './admin-authorization.guard';

describe('AdminAuthorizationGuard', () => {
  it('allows only an explicitly marked current ACTIVE ADMIN principal', () => {
    const { context, reflector } = createFixture({
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    const guard = new AdminAuthorizationGuard(reflector as never);

    expect(guard.canActivate(context)).toBe(true);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ADMIN_ONLY_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });

  it('fails closed when the admin-only policy metadata is absent', () => {
    const { context, reflector } = createFixture({
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const guard = new AdminAuthorizationGuard(reflector as never);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('returns unauthorized when authentication did not attach a principal', () => {
    const { context, reflector } = createFixture(undefined);
    const guard = new AdminAuthorizationGuard(reflector as never);

    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it.each([
    { role: 'CUSTOMER' as const, status: 'ACTIVE' as const },
    { role: 'ADMIN' as const, status: 'DISABLED' as const },
  ])('returns forbidden for a current non-admin principal %#', (principal) => {
    const { context, reflector } = createFixture(principal);
    const guard = new AdminAuthorizationGuard(reflector as never);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });
});

function createFixture(
  principal:
    | Readonly<{ role: 'ADMIN' | 'CUSTOMER'; status: 'ACTIVE' | 'DISABLED' }>
    | undefined,
) {
  const request = { activeSession: principal };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
  const context = {
    getClass: jest.fn(),
    getHandler: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, reflector };
}
