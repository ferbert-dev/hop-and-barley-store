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
    await expect(request.clone().json()).resolves.toEqual({
      email: 'brewer@example.com',
      password: 'Abcdefghi1!x',
    });
  });

  it('keeps failures generic', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ status: 'unavailable' }), {
          headers: { 'cache-control': 'private, no-store' },
          status: 429,
        }),
    );
    vi.stubGlobal('fetch', fetch);
    const formData = credentials();
    formData.set('rememberMe', 'true');

    await expect(
      loginFromBrowser('/', INITIAL_AUTH_FORM_STATE, formData),
    ).resolves.toEqual({ status: 'unavailable' });
    await expect(fetch.mock.calls[0]![0].clone().json()).resolves.toEqual({
      email: 'brewer@example.com',
      password: expect.any(String),
      rememberMe: true,
    });
  });

  it('fails an invalid or missing remember choice closed to unchecked', async () => {
    const fetch = vi.fn<(request: Request) => Promise<Response>>(
      async () =>
        new Response(JSON.stringify({ status: 'unavailable' }), {
          headers: { 'cache-control': 'private, no-store' },
          status: 429,
        }),
    );
    vi.stubGlobal('fetch', fetch);

    const invalid = credentials();
    invalid.set('rememberMe', 'unexpected');
    await loginFromBrowser('/', INITIAL_AUTH_FORM_STATE, invalid);
    await loginFromBrowser('/', INITIAL_AUTH_FORM_STATE, credentials());

    for (const [request] of fetch.mock.calls) {
      await expect(request.clone().json()).resolves.toMatchObject({
        rememberMe: false,
      });
    }
  });
});

function credentials() {
  const form = new FormData();
  form.set('email', 'brewer@example.com');
  form.set('password', 'Abcdefghi1!x');
  form.set('confirmPassword', 'Abcdefghi1!x');
  return form;
}
