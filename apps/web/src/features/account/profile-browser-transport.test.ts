// @vitest-environment node

import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deleteAvatarFromBrowser,
  saveAvatarFromBrowser,
  saveProfileFromBrowser,
} from './profile-browser-transport';

const csrfToken = `v1.${'A'.repeat(43)}`;
const privateHeaders = {
  'cache-control': 'private, no-store',
  'content-type': 'application/json',
};

beforeEach(() => {
  vi.stubGlobal('window', { location: { origin: 'http://localhost:3000' } });
});

afterEach(() => vi.unstubAllGlobals());

describe('browser customer profile transport', () => {
  it('uses the generated self-only path with a private CSRF request and exact mutation headers', async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }, 200))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            email: 'brewer@example.com',
            primaryAddress: null,
            profile: null,
            role: 'CUSTOMER',
          },
          200,
        ),
      );
    vi.stubGlobal('fetch', fetch);

    await expect(
      saveProfileFromBrowser({
        primaryAddress: null,
        profile: { fullName: 'Brewer', phone: '+34 600 123 456' },
      }),
    ).resolves.toMatchObject({ kind: 'saved' });

    const [csrfRequest] = fetch.mock.calls[0] ?? [];
    const [patchRequest] = fetch.mock.calls[1] ?? [];
    expect(csrfRequest?.url).toBe('http://localhost:3001/api/v1/auth/csrf');
    expect(csrfRequest?.credentials).toBe('include');
    expect(patchRequest?.url).toBe('http://localhost:3001/api/v1/users/me');
    expect(patchRequest?.headers.get('origin')).toBe(window.location.origin);
    expect(patchRequest?.headers.get('x-csrf-token')).toBe(csrfToken);
    await expect(patchRequest?.clone().json()).resolves.toEqual({
      primaryAddress: null,
      profile: { fullName: 'Brewer', phone: '+34 600 123 456' },
    });
  });

  it('sends an avatar as multipart FormData through the generated avatar path', async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken }, 200))
      .mockResolvedValueOnce(
        jsonResponse(
          {
            contentType: 'image/png',
            sizeBytes: 8,
            updatedAt: '2026-08-28T12:00:00.000Z',
          },
          200,
        ),
      );
    vi.stubGlobal('fetch', fetch);

    const avatar = new NodeFile(['avatar'], 'avatar.png', {
      type: 'image/png',
    }) as unknown as File;
    await expect(saveAvatarFromBrowser(avatar)).resolves.toMatchObject({
      kind: 'saved',
    });

    const [request] = fetch.mock.calls[1] ?? [];
    expect(request?.url).toBe('http://localhost:3001/api/v1/users/me/avatar');
    expect(request?.headers.get('content-type')).toMatch(
      /^multipart\/form-data; boundary=/u,
    );
    const body = await request?.clone().formData();
    expect(body?.get('file')).toMatchObject({ name: 'avatar.png', size: 6 });
  });

  it('does not mutate when the session cannot provide a private CSRF token', async () => {
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({}, 401));
    vi.stubGlobal('fetch', fetch);

    await expect(deleteAvatarFromBrowser()).resolves.toEqual({
      kind: 'unauthenticated',
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    headers: privateHeaders,
    status,
  });
}
