import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { loadAdminProductCreateOptions } from './admin-product-create-server';

const options = {
  categories: [
    { id: '10000000-0000-4000-8000-000000000001', name: 'Hops', slug: 'hops' },
    { id: '10000000-0000-4000-8000-000000000002', name: 'Malt', slug: 'malts' },
    {
      id: '10000000-0000-4000-8000-000000000003',
      name: 'Yeast',
      slug: 'yeast',
    },
    {
      id: '10000000-0000-4000-8000-000000000004',
      name: 'Adjuncts',
      slug: 'adjuncts',
    },
    {
      id: '10000000-0000-4000-8000-000000000005',
      name: 'Kits',
      slug: 'kits',
    },
  ],
  saleKinds: ['WEIGHT', 'PACKAGE', 'KIT'],
} as const;
const privateHeaders = { 'cache-control': 'private, no-store' };

afterEach(() => vi.unstubAllGlobals());

describe('admin create-product options server boundary', () => {
  it('forwards only the selected session cookie to the private options endpoint', async () => {
    const fetch = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) => {
        void _input;
        void _init;
        return Response.json(options, { headers: privateHeaders });
      },
    );
    vi.stubGlobal('fetch', fetch);

    await expect(
      loadAdminProductCreateOptions(
        'hb_session=session-value',
        'http://api:3001/api/v1',
      ),
    ).resolves.toEqual({ kind: 'loaded', options });

    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(url).toBe('http://api:3001/api/v1/admin/products/create-options');
    expect(init?.cache).toBe('no-store');
    expect(init?.headers).toEqual({ Cookie: 'hb_session=session-value' });
  });

  it.each([
    [
      'an invalid category source',
      { ...options, categories: options.categories.slice(0, 3) },
    ],
    ['an unexpected sale kind', { ...options, saleKinds: ['WEIGHT', 'KIT'] }],
  ])('fails closed for %s', async (_label, response) => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json(response, { headers: privateHeaders })),
    );

    await expect(
      loadAdminProductCreateOptions('hb_session=session-value'),
    ).resolves.toEqual({ kind: 'unavailable' });
  });
});
