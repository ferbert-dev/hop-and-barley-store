import { beforeEach, describe, expect, it, vi } from 'vitest';

import { loginFromBrowser, registerFromBrowser } from './auth-browser-actions';
import { INITIAL_AUTH_FORM_STATE } from './auth-state';

beforeEach(() => vi.unstubAllGlobals());

describe('direct browser auth transport', () => {
  it('does not forward spoofable client-address headers', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ status: 'accepted' }), {
          headers: { 'cache-control': 'private, no-store' },
          status: 202,
        }),
    );
    vi.stubGlobal('fetch', fetch);

    await registerFromBrowser(INITIAL_AUTH_FORM_STATE, credentials());

    const request = fetch.mock.calls[0]![0];
    expect(request.url).toBe('http://localhost:3001/api/v1/auth/register');
    expect(request.credentials).toBe('include');
    expect(request.signal.aborted).toBe(false);
    expect(request.headers.get('x-forwarded-for')).toBeNull();
    expect(request.headers.get('forwarded')).toBeNull();
  });

  it('keeps failures generic', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ status: 'unavailable' }), {
            headers: { 'cache-control': 'private, no-store' },
            status: 429,
          }),
      ),
    );
    await expect(
      loginFromBrowser('/', INITIAL_AUTH_FORM_STATE, credentials()),
    ).resolves.toEqual({ status: 'unavailable' });
  });
});

function credentials() {
  const form = new FormData();
  form.set('email', 'brewer@example.com');
  form.set('password', 'correct horse battery staple');
  return form;
}
