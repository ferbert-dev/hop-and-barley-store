import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: {
    getAll: vi.fn(),
    set: vi.fn(),
  },
  getCurrentSession: vi.fn(),
  headers: {
    get: vi.fn(),
  },
  loginWithPassword: vi.fn(),
  logoutCurrentSession: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
  registerWithPassword: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: vi.fn(async () => mocks.cookies),
  headers: vi.fn(async () => mocks.headers),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('./auth-transport', () => ({
  getCurrentSession: mocks.getCurrentSession,
  loginWithPassword: mocks.loginWithPassword,
  logoutCurrentSession: mocks.logoutCurrentSession,
  registerWithPassword: mocks.registerWithPassword,
}));

import { loginAction, logoutAction, registerAction } from './auth-actions';
import { INITIAL_AUTH_FORM_STATE } from './auth-state';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.headers.get.mockReturnValue('http://localhost:3000');
  mocks.cookies.getAll.mockReturnValue([]);
});

describe('auth Server Actions', () => {
  it('rejects presentation-invalid registration before the API boundary', async () => {
    const password = 'short-secret';
    const result = await registerAction(
      INITIAL_AUTH_FORM_STATE,
      formData({ email: 'bad', password }),
    );

    expect(result.status).toBe('invalid');
    expect(JSON.stringify(result)).not.toContain(password);
    expect(mocks.registerWithPassword).not.toHaveBeenCalled();
  });

  it('returns the same generic accepted state for the registration contract', async () => {
    mocks.registerWithPassword.mockResolvedValue({ kind: 'accepted' });

    await expect(
      registerAction(
        INITIAL_AUTH_FORM_STATE,
        formData({
          email: 'brewer@example.com',
          password: 'correct horse battery staple',
        }),
      ),
    ).resolves.toEqual({ status: 'accepted' });
  });

  it('sets the validated HttpOnly cookie and rejects an open post-login redirect', async () => {
    mocks.loginWithPassword.mockResolvedValue({
      cookie: {
        expires: new Date('2026-08-29T10:00:00.000Z'),
        httpOnly: true,
        maxAge: 604800,
        name: 'hb_session',
        path: '/',
        sameSite: 'lax',
        secure: false,
        value: 'A'.repeat(43),
      },
      kind: 'authenticated',
      session: { user: { role: 'CUSTOMER' } },
    });

    await expect(
      loginAction(
        'https://evil.example/steal',
        INITIAL_AUTH_FORM_STATE,
        formData({
          email: 'brewer@example.com',
          password: 'correct horse battery staple',
        }),
      ),
    ).rejects.toThrow('NEXT_REDIRECT:/');

    expect(mocks.cookies.set).toHaveBeenCalledWith(
      expect.objectContaining({
        httpOnly: true,
        name: 'hb_session',
        sameSite: 'lax',
      }),
    );
  });

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

function formData(values: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  return data;
}
