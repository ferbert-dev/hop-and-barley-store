import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));

import AdminIndexPage from './page';
import AdminProductsPage from './products/page';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('admin routes', () => {
  it('renders the non-interactive Figma-confirmed shell inside the authorized layout', () => {
    render(<AdminProductsPage />);

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
    expect(
      screen.getByText('Product management is not available yet.'),
    ).toBeVisible();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('redirects an authorized /admin request to the protected products shell', async () => {
    await expect(AdminIndexPage()).rejects.toThrow(
      'NEXT_REDIRECT:/admin/products',
    );
  });
});
