import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { loadAdminProduct } from './admin-product-edit-server';

const product = {
  category: {
    id: '10000000-0000-4000-8000-000000000005',
    name: 'Kits',
    slug: 'kits',
  },
  description: 'A five-gallon all-grain recipe kit.',
  id: '20000000-0000-4000-8000-00000000000d',
  imagePath: '/assets/products/west-coast-ipa-kit.webp',
  isActive: true,
  kitYieldVolumeMl: 18_927,
  name: 'West Coast IPA All Grain Kit',
  priceMinor: 4_999,
  saleKind: 'KIT',
  stockAmount: 12,
  teaser: 'A bright, bitter West Coast IPA kit.',
  updatedAt: '2026-09-03T08:00:00.000Z',
};

afterEach(() => vi.unstubAllGlobals());

describe('admin product edit server boundary', () => {
  it('returns anonymous without contacting the API when there is no session', async () => {
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);

    await expect(loadAdminProduct(null, product.id)).resolves.toEqual({
      kind: 'anonymous',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('loads an editable kit through the private admin endpoint', async () => {
    const fetch = vi.fn(async () =>
      Response.json(product, {
        headers: { 'cache-control': 'private, no-store' },
      }),
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      loadAdminProduct(
        'hb_session=session-value',
        product.id,
        'http://api:3001/api/v1',
      ),
    ).resolves.toEqual({ kind: 'loaded', product });

    expect(fetch).toHaveBeenCalledWith(
      `http://api:3001/api/v1/admin/products/${product.id}`,
      expect.objectContaining({
        cache: 'no-store',
        headers: { Cookie: 'hb_session=session-value' },
      }),
    );
  });

  it.each([
    [403, 'denied'],
    [404, 'not-found'],
  ] as const)('maps a %s response to %s', async (status, kind) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {},
          { headers: { 'cache-control': 'private, no-store' }, status },
        ),
      ),
    );

    await expect(
      loadAdminProduct('hb_session=session-value', product.id),
    ).resolves.toEqual({ kind });
  });
});
