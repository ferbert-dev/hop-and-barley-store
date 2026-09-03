import { describe, expect, it, vi } from 'vitest';

import { updateAdminProductFromBrowser } from './admin-product-update-transport';

const privateHeaders = { 'cache-control': 'private, no-store' };

describe('admin product update browser transport', () => {
  it('sends the optimistic version and optional multipart fields with CSRF', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json(
          { csrfToken: `v1.${'A'.repeat(43)}` },
          { headers: privateHeaders },
        ),
      )
      .mockResolvedValueOnce(
        Response.json({ id: 'product-id' }, { headers: privateHeaders }),
      );

    await updateAdminProductFromBrowser(
      '12345678-1234-4abc-8abc-1234567890ab',
      {
        categoryId: '10000000-0000-4000-8000-000000000001',
        description: 'Updated product.',
        expectedUpdatedAt: '2026-09-03T08:00:00.000Z',
        isActive: false,
        name: 'Updated Hops',
        price: '6.49',
        saleKind: 'WEIGHT',
        stockAmount: 28_400_000,
        teaser: 'Updated citrus hops.',
      },
      {
        apiUrl: 'http://localhost:3001',
        fetcher,
        origin: 'http://127.0.0.1:3000',
      },
    );

    const [url, init] = fetcher.mock.calls[1] ?? [];
    expect(url).toBe(
      'http://localhost:3001/api/v1/admin/products/12345678-1234-4abc-8abc-1234567890ab',
    );
    expect(init?.method).toBe('PATCH');
    expect(init?.headers).toEqual({
      'X-CSRF-Token': `v1.${'A'.repeat(43)}`,
    });
    const body = init?.body as FormData;
    expect(body.get('expectedUpdatedAt')).toBe('2026-09-03T08:00:00.000Z');
    expect(body.get('isActive')).toBe('false');
    expect(body.get('image')).toBeNull();
  });

  it('surfaces a stale-write conflict', async () => {
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
          { status: 'update-conflict' },
          { headers: privateHeaders, status: 409 },
        ),
      );

    await expect(
      updateAdminProductFromBrowser(
        '12345678-1234-4abc-8abc-1234567890ab',
        {
          categoryId: '10000000-0000-4000-8000-000000000001',
          description: 'Updated product.',
          expectedUpdatedAt: '2026-09-03T08:00:00.000Z',
          isActive: true,
          name: 'Updated Hops',
          price: '6.49',
          saleKind: 'WEIGHT',
          stockAmount: 28_400_000,
        },
        { fetcher, origin: 'http://127.0.0.1:3000' },
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
});
