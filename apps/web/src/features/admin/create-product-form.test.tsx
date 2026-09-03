import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  revalidate: vi.fn(),
  refresh: vi.fn(),
  update: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock('./admin-product-create-transport', () => ({
  createAdminProductFromBrowser: mocks.create,
}));
vi.mock('./admin-product-actions', () => ({
  revalidateProductViews: mocks.revalidate,
}));
vi.mock('./admin-product-update-transport', () => ({
  updateAdminProductFromBrowser: mocks.update,
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
    {
      id: '10000000-0000-4000-8000-000000000005',
      name: 'Kits',
      slug: 'kits',
    },
  ],
  saleKinds: ['WEIGHT', 'PACKAGE', 'KIT'] as const,
};

beforeEach(() => {
  mocks.create.mockReset();
  mocks.revalidate.mockReset();
  mocks.revalidate.mockResolvedValue(undefined);
  mocks.refresh.mockReset();
  mocks.update.mockReset();
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

  it('prefills and updates an existing product without requiring a new image', async () => {
    const user = userEvent.setup();
    mocks.update.mockResolvedValue(undefined);
    render(
      <CreateProductForm
        options={options}
        product={{
          activeFrom: '2026-09-01T10:00:00.000Z',
          activeUntil: null,
          amountUnit: 'MILLIGRAM',
          category: options.categories[0]!,
          createdAt: '2026-09-01T10:00:00.000Z',
          currency: 'USD',
          description: 'Bright citrus hops.',
          id: '12345678-1234-4abc-8abc-1234567890ab',
          imagePath: '/assets/products/citra-hops.webp',
          isActive: true,
          kitYieldVolumeMl: null,
          maximumOrderAmount: 100_000_000,
          minimumOrderAmount: 100_000,
          name: 'Citra Hops',
          orderStepAmount: 100_000,
          packageNetWeightMg: null,
          priceBasisAmount: 100_000,
          priceMinor: 599,
          priceQualifier: 'per 100g',
          saleKind: 'WEIGHT',
          slug: 'citra-hops',
          specifications: [{ label: 'Product Type', value: 'Hops' }],
          stockAmount: 28_400_000,
          teaser: 'Bright citrus.',
          updatedAt: '2026-09-02T10:00:00.000Z',
        }}
      />,
    );

    expect(screen.getByLabelText('Title')).toHaveValue('Citra Hops');
    const cancel = screen.getByRole('link', { name: 'Cancel' });
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(
      cancel.compareDocumentPosition(save) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    await user.clear(screen.getByLabelText('Price (USD)'));
    await user.type(screen.getByLabelText('Price (USD)'), '6.49');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(mocks.update).toHaveBeenCalledWith(
        '12345678-1234-4abc-8abc-1234567890ab',
        expect.objectContaining({
          expectedUpdatedAt: '2026-09-02T10:00:00.000Z',
          price: '6.49',
        }),
      ),
    );
    expect(mocks.update.mock.calls[0]?.[1]).not.toHaveProperty('image');
    expect(
      await screen.findByRole('heading', { name: 'Product updated' }),
    ).toBeVisible();
  });
});
