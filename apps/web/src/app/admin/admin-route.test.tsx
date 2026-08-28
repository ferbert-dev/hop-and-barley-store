import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  cookies: vi.fn(async () => ({ getAll: () => [] })),
  loadAdminProducts: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('next/headers', () => ({ cookies: mocks.cookies }));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
vi.mock('server-only', () => ({}));
vi.mock('../../features/admin/admin-products-server', () => ({
  loadAdminProducts: mocks.loadAdminProducts,
}));

import AdminIndexPage from './page';
import AdminProductsPage from './products/page';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadAdminProducts.mockResolvedValue({ kind: 'unavailable' });
});

describe('admin routes', () => {
  it('keeps the Figma-confirmed shell while showing the read-only product error state', async () => {
    render(await AdminProductsPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByRole('heading', { name: 'Admin - Product Stock' }),
    ).toBeVisible();
    expect(
      screen.getByText('Product Management', { selector: 'span' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(screen.getByText('Dashboard')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'We could not load product management safely.',
    );
  });

  it('redirects an authorized /admin request to the protected products list', async () => {
    await expect(AdminIndexPage()).rejects.toThrow(
      'NEXT_REDIRECT:/admin/products',
    );
  });
});
