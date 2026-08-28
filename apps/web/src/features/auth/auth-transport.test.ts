import { afterEach, describe, expect, it, vi } from 'vitest';

import type { components } from '@hop-and-barley/api-client';

vi.mock('server-only', () => ({}));

import {
  getCurrentSession,
  loginWithPassword,
  logoutCurrentSession,
  registerWithPassword,
} from './auth-transport';

const session: components['schemas']['AuthSessionDto'] = {
  absoluteExpiresAt: '2026-08-29T10:00:00.000Z',
  idleExpiresAt: '2026-08-23T10:00:00.000Z',
  issuedAt: '2026-08-22T10:00:00.000Z',
  user: {
    id: '10000000-0000-4000-8000-000000000001',
    role: 'CUSTOMER',
    status: 'ACTIVE',
  },
};

const privateHeaders = {
  'cache-control': 'private, no-store',
  'content-type': 'application/json',
  vary: 'Cookie, Origin',
};

afterEach(() => vi.unstubAllGlobals());

describe('generated-client auth transport', () => {
  it('forwards registration through the generated path with exact Origin and no-store', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      jsonResponse({ status: 'accepted' }, 202),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      registerWithPassword(
        {
          email: 'brewer@example.com',
          password: 'correct horse battery staple',
        },
        'http://localhost:3000',
        'http://api:3001/api/v1',
      ),
    ).resolves.toEqual({ kind: 'accepted' });

    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe('http://api:3001/api/v1/auth/register');
    expect(request.cache).toBe('no-store');
    expect(request.headers.get('origin')).toBe('http://localhost:3000');
    await expect(request.clone().json()).resolves.toEqual({
      email: 'brewer@example.com',
      password: 'correct horse battery staple',
    });
  });

  it('returns a safe session DTO and validated upstream cookie after login', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      jsonResponse(session, 200, {
        'set-cookie': `hb_session=${'A'.repeat(43)}; Path=/; HttpOnly; SameSite=Lax`,
      }),
    );
    vi.stubGlobal('fetch', fetch);

    const result = await loginWithPassword(
      {
        email: 'brewer@example.com',
        password: 'correct horse battery staple',
        rememberMe: false,
      },
      'http://localhost:3000',
      'http://api:3001/api/v1',
    );

    expect(result).toMatchObject({ kind: 'authenticated', session });
    expect(result).not.toHaveProperty('csrfToken');
    expect(result).not.toHaveProperty('token');
    const request = fetch.mock.calls[0]?.[0] as Request;
    await expect(request.clone().json()).resolves.toMatchObject({
      rememberMe: false,
    });
  });

  it('forwards only the selected session cookie for a private session read', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      jsonResponse(session, 200),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      getCurrentSession('hb_session=session-value', 'http://api:3001/api/v1'),
    ).resolves.toEqual({ kind: 'authenticated', session });

    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.cache).toBe('no-store');
    expect(request.headers.get('cookie')).toBe('hb_session=session-value');
  });

  it('keeps CSRF server-side while revoking and clearing the session', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ csrfToken: `v1.${'A'.repeat(43)}` }, 200),
      )
      .mockResolvedValueOnce(
        jsonResponse({ status: 'signed-out' }, 200, {
          'set-cookie':
            'hb_session=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=/; HttpOnly; SameSite=Lax',
        }),
      );
    vi.stubGlobal('fetch', fetch);

    const result = await logoutCurrentSession(
      'hb_session=session-value',
      'http://localhost:3000',
      'http://api:3001/api/v1',
    );

    expect(result).toMatchObject({ kind: 'signed-out' });
    expect(JSON.stringify(result)).not.toContain(`v1.${'A'.repeat(43)}`);
    const logoutRequest = fetch.mock.calls[1]?.[0] as Request;
    expect(logoutRequest.headers.get('x-csrf-token')).toBe(
      `v1.${'A'.repeat(43)}`,
    );
    expect(logoutRequest.headers.get('origin')).toBe('http://localhost:3000');
  });

  it('fails closed when a private response drops its cache contract', async () => {
    const fetch = vi.fn(
      async () =>
        new Response(JSON.stringify(session), {
          headers: { 'content-type': 'application/json' },
          status: 200,
        }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      getCurrentSession('hb_session=session-value', 'http://api:3001/api/v1'),
    ).resolves.toEqual({ kind: 'unavailable' });
  });
});

function jsonResponse(
  body: unknown,
  status: number,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    headers: { ...privateHeaders, ...extraHeaders },
    status,
  });
}
