import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('./admin-product-create-transport', () => ({
  createAdminProductFromBrowser: mocks.create,
}));

import { CreateProductForm } from './create-product-form';

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
  ],
  saleKinds: ['WEIGHT', 'PACKAGE'] as const,
};

beforeEach(() => {
  mocks.create.mockReset();
  mocks.refresh.mockReset();
  vi.stubGlobal('URL', {
    createObjectURL: vi.fn(() => 'blob:preview'),
    revokeObjectURL: vi.fn(),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('CreateProductForm', () => {
  it('validates, converts, uploads and shows a created-product handoff', async () => {
    const user = userEvent.setup();
    mocks.create.mockResolvedValue({
      id: '12345678-1234-4abc-8abc-1234567890ab',
      imagePath: '/product-assets/12345678-1234-4abc-8abc-1234567890ab.webp',
      slug: 'new-hops',
    });
    render(<CreateProductForm options={options} />);

    await user.type(screen.getByLabelText('Title'), 'New Hops');
    await user.type(
      screen.getByLabelText('Description'),
      'Fresh aromatic hops.',
    );
    await user.type(screen.getByLabelText('Price (USD)'), '5.9');
    await user.type(screen.getByLabelText('Stock (kg)'), '1.2');
    await user.upload(
      screen.getByLabelText('Choose image'),
      new File(['image'], 'hops.webp', { type: 'image/webp' }),
    );
    expect(
      screen.getByAltText('Selected product image preview'),
    ).toHaveAttribute('src', 'blob:preview');

    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(mocks.create).toHaveBeenCalledWith(
        expect.objectContaining({
          price: '5.90',
          saleKind: 'WEIGHT',
          stockAmount: 1_200_000,
        }),
      ),
    );
    expect(
      await screen.findByRole('heading', { name: 'Product created' }),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'View product' })).toHaveAttribute(
      'href',
      '/product/new-hops',
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it('does not submit an invalid form', async () => {
    const user = userEvent.setup();
    render(<CreateProductForm options={options} />);

    await user.click(screen.getByRole('button', { name: 'Save' }));

    expect(
      await screen.findByText('Choose a JPEG, PNG, or WebP image.'),
    ).toBeVisible();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('shows only package-specific stock controls after choosing Package', async () => {
    const user = userEvent.setup();
    render(<CreateProductForm options={options} />);

    await user.click(screen.getByRole('radio', { name: 'Package' }));

    expect(screen.getByLabelText('Stock (packages)')).toBeVisible();
    expect(screen.getByLabelText('Package net weight (g)')).toBeVisible();
    expect(screen.queryByLabelText('Stock (kg)')).toBeNull();
  });
});
