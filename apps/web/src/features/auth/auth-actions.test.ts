import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: {
    getAll: vi.fn(),
    set: vi.fn(),
  },
  headers: {
    get: vi.fn(),
  },
  logoutCurrentSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mocks.cookies),
  headers: vi.fn(async () => mocks.headers),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('./auth-transport', () => ({
  logoutCurrentSession: mocks.logoutCurrentSession,
}));

import { logoutAction } from './auth-actions';
import { INITIAL_AUTH_FORM_STATE } from './auth-state';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.get.mockReturnValue('http://localhost:3000');
  mocks.cookies.getAll.mockReturnValue([]);
});

describe('auth Server Actions', () => {
  it('forwards only the server cookie during logout and never returns CSRF material', async () => {
    mocks.cookies.getAll.mockReturnValue([
      { name: 'theme', value: 'dark' },
      { name: 'hb_session', value: 'session-value' },
    ]);
    mocks.logoutCurrentSession.mockResolvedValue({
      cookie: {
        expires: new Date(0),
        httpOnly: true,
        maxAge: 0,
        name: 'hb_session',
        path: '/',
        sameSite: 'lax',
        secure: false,
        value: '',
      },
      kind: 'signed-out',
    });

    await expect(
      logoutAction(INITIAL_AUTH_FORM_STATE, new FormData()),
    ).rejects.toThrow('NEXT_REDIRECT:/login?status=signed-out');
    expect(mocks.logoutCurrentSession).toHaveBeenCalledWith(
      'hb_session=session-value',
      'http://localhost:3000',
    );
    expect(JSON.stringify(mocks.cookies.set.mock.calls)).not.toContain('csrf');
  });
});
