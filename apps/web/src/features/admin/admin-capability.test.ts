import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { getAdminCapability } from './admin-capability';

const privateHeaders = {
  'cache-control': 'private, no-store',
  'content-type': 'application/json',
  vary: 'Cookie, Origin',
};

afterEach(() => vi.unstubAllGlobals());

describe('admin capability transport', () => {
  it('forwards the selected session cookie only to the local generated endpoint', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(async () =>
      jsonResponse({ productManagement: true }, 200),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      getAdminCapability('hb_session=session-value', 'http://api:3001/api/v1'),
    ).resolves.toEqual({ kind: 'authorized' });

    const request = fetch.mock.calls[0]?.[0] as Request;
    expect(request.url).toBe('http://api:3001/api/v1/admin/capabilities');
    expect(request.cache).toBe('no-store');
    expect(request.headers.get('cookie')).toBe('hb_session=session-value');
  });

  it('routes missing or rejected sessions without disclosing authorization detail', async () => {
    await expect(getAdminCapability(null)).resolves.toEqual({
      kind: 'anonymous',
    });

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(null, { headers: privateHeaders, status: 403 }),
      ),
    );
    await expect(
      getAdminCapability('hb_session=session-value', 'http://api:3001/api/v1'),
    ).resolves.toEqual({ kind: 'denied' });
  });

  it('fails closed for a cacheable response or a non-local API origin', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ productManagement: true }), {
            headers: { 'content-type': 'application/json' },
            status: 200,
          }),
      ),
    );

    await expect(
      getAdminCapability('hb_session=session-value', 'http://api:3001/api/v1'),
    ).resolves.toEqual({ kind: 'denied' });
    await expect(
      getAdminCapability(
        'hb_session=session-value',
        'https://api.example.test',
      ),
    ).resolves.toEqual({ kind: 'denied' });
  });
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: privateHeaders,
    status,
  });
}
