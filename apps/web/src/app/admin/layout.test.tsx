import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND');
  }),
  readAdminCapability: vi.fn(),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  }),
}));

vi.mock('next/navigation', () => ({
  notFound: mocks.notFound,
  redirect: mocks.redirect,
}));
vi.mock('../../features/admin/admin-capability', () => ({
  readAdminCapability: mocks.readAdminCapability,
}));

import AdminLayout from './layout';

beforeEach(() => vi.clearAllMocks());

describe('admin layout authorization boundary', () => {
  it('redirects anonymous visitors to the safe internal return path', async () => {
    mocks.readAdminCapability.mockResolvedValue({ kind: 'anonymous' });

    await expect(AdminLayout({ children: <p>Protected</p> })).rejects.toThrow(
      'NEXT_REDIRECT:/login?next=%2Fadmin%2Fproducts',
    );
  });

  it('uses the neutral not-found boundary for a customer or unavailable capability', async () => {
    mocks.readAdminCapability.mockResolvedValue({ kind: 'denied' });

    await expect(AdminLayout({ children: <p>Protected</p> })).rejects.toThrow(
      'NEXT_NOT_FOUND',
    );
  });

  it('renders child routes only after Nest has granted the capability', async () => {
    mocks.readAdminCapability.mockResolvedValue({ kind: 'authorized' });

    render(await AdminLayout({ children: <h1>Protected admin content</h1> }));

    expect(
      screen.getByRole('heading', { name: 'Protected admin content' }),
    ).toBeVisible();
  });
});
