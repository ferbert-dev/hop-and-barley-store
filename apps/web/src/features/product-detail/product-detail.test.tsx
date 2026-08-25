import { fireEvent, render, screen, within } from '@testing-library/react';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import ProductDetailError from '../../app/product/[slug]/error';
import ProductDetailLoading from '../../app/product/[slug]/loading';
import ProductDetailNotFound from '../../app/product/[slug]/not-found';
import { CartProvider } from '../cart/cart-context';
import type { Cart, CartTransport } from '../cart/cart-transport';
import { ProductDetail } from './product-detail';

vi.mock('next/image', () => ({
  default: ({
    alt,
    preload,
    ...props
  }: ComponentProps<'img'> & { preload?: boolean }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} data-preload={preload ? 'true' : undefined} {...props} />
  ),
}));

const product = {
  availability: 'in-stock' as const,
  category: { name: 'Hops', slug: 'hops' },
  currency: 'USD' as const,
  description: 'First paragraph.\n\nSecond paragraph.\n\nThird paragraph.',
  id: '20000000-0000-4000-8000-000000000001',
  imagePath: '/assets/products/citra-hops.webp',
  name: 'Citra Hops',
  priceMinor: 599,
  priceQualifier: 'per 100g',
  slug: 'citra-hops',
  specifications: [
    { label: 'Origin', value: 'USA' },
    { label: 'Uses', value: ['Late additions', 'Dry hopping'] },
  ],
  teaser: 'Ideal for IPAs and Pale Ales',
};

const emptyCart: Cart = {
  adjustmentMessage: null,
  checkoutEligible: false,
  currency: 'USD',
  distinctItemCount: 0,
  items: [],
  serverNow: '2026-08-25T10:00:00.000Z',
  subtotalMinor: 0,
  totalQuantity: 0,
};

function createTransport(): CartTransport {
  return {
    add: vi.fn(async () => emptyCart),
    clear: vi.fn(async () => emptyCart),
    load: vi.fn(async () => emptyCart),
    recheck: vi.fn(async () => emptyCart),
    remove: vi.fn(async () => emptyCart),
    update: vi.fn(async () => emptyCart),
  };
}

function renderProductDetail(
  detailProduct: typeof product = product,
  transport = createTransport(),
) {
  return render(
    <CartProvider transport={transport}>
      <ProductDetail product={detailProduct} />
    </CartProvider>,
  );
}

describe('ProductDetail', () => {
  it('renders the shared product template, ordered specifications and cart action', async () => {
    renderProductDetail();

    expect(screen.getByRole('heading', { name: 'Citra Hops' })).toBeVisible();
    expect(screen.getByText('US$5.99')).toBeVisible();
    expect(screen.getByText('per 100g')).toBeVisible();
    expect(screen.getByText('Viewing Citra Hops')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
        'link',
        { name: 'Products' },
      ),
    ).toHaveAttribute('href', '/');
    expect(screen.getByRole('img', { name: 'Citra hops' })).toHaveAttribute(
      'src',
      '/assets/products/citra-hops.webp',
    );
    expect(screen.getByRole('img', { name: 'Citra hops' })).toHaveAttribute(
      'data-preload',
      'true',
    );
    const description = screen.getByLabelText('Product description');
    expect(within(description).getAllByRole('paragraph')).toHaveLength(3);
    const terms = screen.getAllByRole('term');
    expect(terms.map((term) => term.textContent)).toEqual(['Origin', 'Uses']);
    expect(screen.getByText('Late additions')).toBeVisible();
    expect(screen.getByText('Dry hopping')).toBeVisible();
    const specifications = screen.getByText('Technical Specifications', {
      exact: true,
    });
    expect(specifications).toBeVisible();
    expect(specifications.parentElement).toHaveAttribute('open', '');
    expect(
      await screen.findByRole('button', { name: 'Add to Cart' }),
    ).toBeEnabled();
    expect(screen.queryByRole('heading', { name: /reviews/i })).toBeNull();
  });

  it('does not expose exact stock details on the product page', async () => {
    const transport = createTransport();
    const { rerender } = renderProductDetail(product, transport);
    expect(screen.queryByText(/100 in stock/i)).toBeNull();
    expect(screen.queryByText('In stock')).toBeNull();

    rerender(
      <CartProvider transport={transport}>
        <ProductDetail product={{ ...product, availability: 'out-of-stock' }} />
      </CartProvider>,
    );
    expect(await screen.findByText('Out of stock')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add to Cart' })).toBeDisabled();
    expect(screen.getByText('Viewing Citra Hops')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(
      within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByRole(
        'link',
        { name: 'Products' },
      ),
    ).toHaveAttribute('href', '/');
  });

  it('fails closed when the API image path differs from the local manifest', () => {
    expect(() =>
      render(
        <ProductDetail
          product={{
            ...product,
            imagePath: '/assets/products/mosaic-hops.webp',
          }}
        />,
      ),
    ).toThrow(/product detail asset contract/i);
  });

  it('renders a polite loading state with a stable accessible name', () => {
    render(<ProductDetailLoading />);

    const status = screen.getByRole('status');
    expect(
      within(status).getByRole('heading', { name: 'Loading product details' }),
    ).toBeVisible();
    expect(status).toHaveAttribute('aria-busy', 'true');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent(
      'Fetching the latest product information.',
    );
  });

  it('renders a polite not-found state with a native recovery link', () => {
    render(<ProductDetailNotFound />);

    const status = screen.getByRole('status');
    expect(
      within(status).getByRole('heading', { name: 'Product not found' }),
    ).toBeVisible();
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(
      within(status).getByRole('link', { name: 'Back to products' }),
    ).toHaveAttribute('href', '/');
  });

  it('renders an assertive API error with a native retry button', () => {
    const reset = vi.fn();
    render(<ProductDetailError reset={reset} />);

    const alert = screen.getByRole('alert');
    expect(
      within(alert).getByRole('heading', {
        name: 'Product details unavailable',
      }),
    ).toBeVisible();
    expect(alert).toHaveAttribute('aria-live', 'assertive');
    const retry = within(alert).getByRole('button', { name: 'Try again' });
    expect(retry).toHaveAttribute('type', 'button');
    fireEvent.click(retry);
    expect(reset).toHaveBeenCalledOnce();
  });
});
