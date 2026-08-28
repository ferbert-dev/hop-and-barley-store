import { describe, expect, it, vi } from 'vitest';

import { createAdminProductFromBrowser } from './admin-product-create-transport';

const privateHeaders = { 'cache-control': 'private, no-store' };
const payload = {
  activeFrom: '2026-08-28T10:00:00.000Z',
  categoryId: '10000000-0000-4000-8000-000000000001',
  description: 'A new product.',
  image: new File(['image'], 'hop.webp', { type: 'image/webp' }),
  isActive: true,
  name: 'New Hops',
  price: '5.90',
  saleKind: 'WEIGHT' as const,
  stockAmount: 1_200_000,
};

describe('admin product creation browser transport', () => {
  it('gets CSRF then submits credentialed multipart without forbidden request headers', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { csrfToken: `v1.${'A'.repeat(43)}` },
          { headers: privateHeaders },
        ),
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            id: '12345678-1234-4abc-8abc-1234567890ab',
            imagePath:
              '/product-assets/12345678-1234-4abc-8abc-1234567890ab.webp',
            slug: 'new-hops',
          },
          { headers: privateHeaders, status: 201 },
        ),
      );

    await expect(
      createAdminProductFromBrowser(payload, {
        apiUrl: 'http://localhost:3001',
        fetcher,
        origin: 'http://127.0.0.1:3000',
      }),
    ).resolves.toMatchObject({ slug: 'new-hops' });

    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'http://localhost:3001/api/v1/auth/csrf',
    );
    const [url, init] = fetcher.mock.calls[1] ?? [];
    expect(url).toBe('http://localhost:3001/api/v1/admin/products');
    expect(init?.credentials).toBe('include');
    expect(init?.headers).toMatchObject({
      'X-CSRF-Token': `v1.${'A'.repeat(43)}`,
    });
    expect(init?.headers).not.toHaveProperty('Content-Type');
    expect(init?.headers).not.toHaveProperty('Origin');
    expect(init?.body).toBeInstanceOf(FormData);
    const body = init?.body as FormData;
    expect(body.get('stockAmount')).toBe('1200000');
    expect(body.get('image')).toBeInstanceOf(File);
  });

  it('fails closed for a cacheable CSRF response', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ csrfToken: `v1.${'A'.repeat(43)}` }));

    await expect(
      createAdminProductFromBrowser(payload, {
        apiUrl: 'http://localhost:3001',
        fetcher,
        origin: 'http://127.0.0.1:3000',
      }),
    ).rejects.toThrow(/creation failed/i);
  });
});
