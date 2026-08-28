import { afterEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

afterEach(() => vi.unstubAllGlobals());

describe('uploaded product asset route', () => {
  const key = '12345678-1234-4abc-8abc-1234567890ab.webp';

  it('rejects an unsafe key without calling the API', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    const response = await GET(
      new Request('http://localhost/product-assets/nope'),
      {
        params: Promise.resolve({ key: '../secret.webp' }),
      },
    );

    expect(response.status).toBe(404);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('proxies only webp content with immutable and nosniff response headers', async () => {
    const fetch = vi.fn(
      async () =>
        new Response('webp', {
          headers: { 'content-type': 'image/webp; charset=binary' },
        }),
    );
    vi.stubGlobal('fetch', fetch);

    const response = await GET(
      new Request(`http://localhost/product-assets/${key}`),
      { params: Promise.resolve({ key }) },
    );

    expect(fetch).toHaveBeenCalledWith(
      `http://localhost:3001/api/v1/product-assets/${key}`,
      expect.objectContaining({ cache: 'force-cache' }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('image/webp');
    expect(response.headers.get('cache-control')).toContain('immutable');
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('does not proxy a successful response with an unexpected media type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('html', { headers: { 'content-type': 'text/html' } }),
      ),
    );

    const response = await GET(
      new Request(`http://localhost/product-assets/${key}`),
      { params: Promise.resolve({ key }) },
    );

    expect(response.status).toBe(502);
  });
});
