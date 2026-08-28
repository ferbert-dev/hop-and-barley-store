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
  it('allows a marked route for a current ACTIVE ADMIN principal', () => {
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

  it('protects an unmarked admin namespace route for a current ACTIVE ADMIN', () => {
    const { context, reflector } = createFixture({
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const guard = new AdminAuthorizationGuard(reflector as never);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('denies a customer on an unmarked admin namespace route', () => {
    const { context, reflector } = createFixture({
      role: 'CUSTOMER',
      status: 'ACTIVE',
    });
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const guard = new AdminAuthorizationGuard(reflector as never);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('does not apply admin authorization outside the admin namespace', () => {
    const { context, reflector } = createFixture(
      {
        role: 'CUSTOMER',
        status: 'ACTIVE',
      },
      '/api/v1/catalog/products',
    );
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const guard = new AdminAuthorizationGuard(reflector as never);

    expect(guard.canActivate(context)).toBe(true);
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
  path = '/api/v1/admin/capabilities',
) {
  const request = { activeSession: principal, path };
  const reflector = { getAllAndOverride: jest.fn().mockReturnValue(true) };
  const context = {
    getClass: jest.fn(),
    getHandler: jest.fn(),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, reflector };
}
