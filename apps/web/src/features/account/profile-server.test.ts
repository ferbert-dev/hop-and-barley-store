import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { readCurrentUserProfile } from './profile-server';

const profile = {
  email: 'brewer@example.com',
  primaryAddress: null,
  profile: null,
  role: 'CUSTOMER',
} as const;

afterEach(() => vi.unstubAllGlobals());

describe('server customer profile transport', () => {
  it('forwards only the session cookie to the generated self-only read path without caching', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      privateJsonResponse(profile, 200),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      readCurrentUserProfile(
        'hb_session=session-value',
        'http://api:3001/api/v1',
      ),
    ).resolves.toEqual({ kind: 'authenticated', profile });

    const [request] = fetch.mock.calls[0] ?? [];
    expect(request?.url).toBe('http://api:3001/api/v1/users/me');
    expect(request?.cache).toBe('no-store');
    expect(request?.headers.get('cookie')).toBe('hb_session=session-value');
  });

  it('fails closed when a private profile response loses its cache contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify(profile), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
      ),
    );

    await expect(
      readCurrentUserProfile(
        'hb_session=session-value',
        'http://api:3001/api/v1',
      ),
    ).resolves.toEqual({ kind: 'unavailable' });
  });
});

function privateJsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: {
      'cache-control': 'private, no-store',
      'content-type': 'application/json',
      vary: 'Cookie, Origin',
    },
    status,
  });
}
