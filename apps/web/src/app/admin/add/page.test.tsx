import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
  loadOptions: vi.fn(),
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
}));
vi.mock('server-only', () => ({}));
vi.mock('../../../features/admin/admin-product-create-server', () => ({
  loadAdminProductCreateOptions: mocks.loadOptions,
}));

import AdminAddProductPage from './page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadOptions.mockResolvedValue({ kind: 'unavailable' });
});

describe('admin add-product route', () => {
  it('uses the exact add-product return path for an anonymous visitor', async () => {
    mocks.loadOptions.mockResolvedValue({ kind: 'anonymous' });

    await expect(
      AdminAddProductPage({ searchParams: Promise.resolve({}) }),
    ).rejects.toThrow('NEXT_REDIRECT:/login?next=%2Fadmin%2Fadd');
  });

  it('does not expose a mutation form for M4 edit intent', async () => {
    render(
      await AdminAddProductPage({
        searchParams: Promise.resolve({
          productId: '12345678-1234-4abc-8abc-1234567890ab',
        }),
      }),
    );

    expect(
      screen.getByRole('heading', {
        name: 'Product editing is not available yet',
      }),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Save' })).toBeNull();
    expect(
      screen.getByRole('link', { name: 'Back to product management' }),
    ).toHaveAttribute('href', '/admin/products');
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
