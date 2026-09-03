import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(async () => ({
    getAll: (): { name: string; value: string }[] => [],
  })),
  loadOptions: vi.fn(),
  loadProduct: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../features/admin/admin-product-create-server', () => ({
  loadAdminProductCreateOptions: mocks.loadOptions,
}));
vi.mock('../../../features/admin/admin-product-edit-server', () => ({
  loadAdminProduct: mocks.loadProduct,
}));

import AdminAddProductPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadOptions.mockResolvedValue({ kind: 'unavailable' });
  mocks.loadProduct.mockResolvedValue({ kind: 'unavailable' });
});

describe('admin add-product route', () => {
  it('uses the exact add-product return path for an anonymous visitor', async () => {
    mocks.loadOptions.mockResolvedValue({ kind: 'anonymous' });

    await expect(
      AdminAddProductPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT:/login?next=%2Fadmin%2Fadd');
  });

  it('loads the mutation form for M4 edit intent', async () => {
    mocks.cookies.mockResolvedValue({
      getAll: () => [{ name: 'hb_session', value: 'session' }],
    });
    mocks.loadOptions.mockResolvedValue({
      kind: 'loaded',
      options: {
        categories: [
          {
            id: '11111111-1111-4111-8111-111111111111',
            name: 'Hops',
            slug: 'hops',
          },
        ],
        saleKinds: ['WEIGHT', 'PACKAGE', 'KIT'],
      },
    });
    mocks.loadProduct.mockResolvedValue({
      kind: 'loaded',
      product: {
        activeFrom: '2026-09-01T10:00:00.000Z',
        activeUntil: null,
        category: {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'Hops',
          slug: 'hops',
        },
        description: 'Bright citrus hops.',
        id: '12345678-1234-4abc-8abc-1234567890ab',
        imagePath: '/assets/products/citra-hops.webp',
        isActive: true,
        name: 'Citra Hops',
        packageNetWeightMg: null,
        priceMinor: 599,
        saleKind: 'WEIGHT',
        slug: 'citra-hops',
        stockAmount: 28_400_000,
        teaser: 'Bright citrus hops.',
        updatedAt: '2026-09-02T10:00:00.000Z',
      },
    });
    render(
      await AdminAddProductPage({
        searchParams: Promise.resolve({
          productId: '12345678-1234-4abc-8abc-1234567890ab',
        }),
      }),
    );

    expect(screen.getByLabelText('Title')).toHaveValue('Citra Hops');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeVisible();
  });

  it('fails safely for arbitrary query keys', async () => {
    render(
      await AdminAddProductPage({
        searchParams: Promise.resolve({ mode: 'edit' }),
      }),
    );

    expect(
      screen.getByRole('heading', { name: 'Invalid product URL' }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
  });
});
