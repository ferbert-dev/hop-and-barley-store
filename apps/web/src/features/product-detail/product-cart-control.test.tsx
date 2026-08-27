import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CartProvider } from '../cart/cart-context';
import type { Cart, CartTransport } from '../cart/cart-transport';
import { ProductCartControl } from './product-cart-control';

const productName = 'Citra Hops';
const productSlug = 'citra-hops';
const quantityMetadata = {
  amountUnit: 'MILLIGRAM' as const,
  kitYieldVolumeMl: null,
  maximumOrderAmount: 100_000_000,
  minimumOrderAmount: 100_000,
  orderStepAmount: 100_000,
  packageNetWeightMg: null,
  priceBasisAmount: 100_000,
  saleKind: 'WEIGHT' as const,
  stockAmount: 100_000_000,
};

const emptyCart: Cart = {
  adjustmentMessage: null,
  checkoutEligible: false,
  currency: 'USD',
  distinctItemCount: 0,
  items: [],
  serverNow: '2026-08-25T10:00:00.000Z',
  subtotalMinor: 0,
};

afterEach(() => cleanup());

function cartWithAmount(amount: number): Cart {
  const lineTotalMinor = (amount / 100_000) * 599;
  return {
    ...emptyCart,
    checkoutEligible: true,
    distinctItemCount: 1,
    items: [
      {
        ...quantityMetadata,
        amount,
        availability: 'available',
        priceMinor: 599,
        imagePath: '/assets/products/citra-hops.webp',
        lineTotalMinor,
        name: productName,
        priceQualifier: 'per 100g',
        productId: '10000000-0000-4000-8000-000000000001',
        productSlug,
        reservationExpiresAt: '2026-08-25T10:15:00.000Z',
        reservationStatus: 'active',
      },
    ],
    subtotalMinor: lineTotalMinor,
  };
}

function createTransport(
  loadedCart: Cart,
  overrides: Partial<CartTransport> = {},
): CartTransport {
  return {
    add: vi.fn(async () => loadedCart),
    clear: vi.fn(async () => loadedCart),
    load: vi.fn(async () => loadedCart),
    recheck: vi.fn(async () => loadedCart),
    remove: vi.fn(async () => loadedCart),
    update: vi.fn(async () => loadedCart),
    ...overrides,
  };
}

function renderControl(
  availability: 'in-stock' | 'out-of-stock' = 'in-stock',
  transport: CartTransport = createTransport(emptyCart),
) {
  return render(
    <CartProvider transport={transport}>
      <ProductCartControl
        availability={availability}
        priceMinor={599}
        productName={productName}
        productSlug={productSlug}
        quantityMetadata={quantityMetadata}
      />
    </CartProvider>,
  );
}

describe('ProductCartControl', () => {
  it('adds the selected physical weight as milligrams without authentication UI', async () => {
    const user = userEvent.setup();
    const transport = createTransport(emptyCart, {
      add: vi.fn(async () => cartWithAmount(200_000)),
    });
    renderControl('in-stock', transport);

    await screen.findAllByLabelText('Quantity');
    await waitFor(() =>
      expect(screen.getAllByLabelText('Quantity').at(-1)).toBeEnabled(),
    );
    const input = screen.getAllByLabelText('Quantity').at(-1);
    if (!input) throw new Error('Quantity input missing');
    await user.clear(input);
    await user.type(input, '0.2');
    await user.click(
      screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
      ).toBeEnabled(),
    );
    expect(transport.add).toHaveBeenCalledWith(productSlug, 200_000);
    expect(screen.queryByText(/in cart/i)).toBeNull();
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
  });

  it('adds the selection to an existing line and exposes unavailable state without stock details', async () => {
    const user = userEvent.setup();
    const transport = createTransport(cartWithAmount(100_000), {
      add: vi.fn(async () => cartWithAmount(300_000)),
    });
    renderControl('in-stock', transport);

    await screen.findAllByLabelText('Quantity');
    await waitFor(() =>
      expect(screen.getAllByLabelText('Quantity').at(-1)).toBeEnabled(),
    );
    const input = screen.getAllByLabelText('Quantity').at(-1);
    if (!input) throw new Error('Quantity input missing');
    await user.clear(input);
    await user.type(input, '0.2');
    await user.click(
      screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
      ).toBeEnabled(),
    );
    expect(transport.add).toHaveBeenCalledWith(productSlug, 200_000);
    expect(transport.update).not.toHaveBeenCalled();
    expect(screen.queryByText(/in cart/i)).toBeNull();

    cleanup();
    renderControl('out-of-stock');
    expect(await screen.findByText('Out of stock')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
    ).toBeDisabled();
    expect(screen.queryByText(/100000|stock amount/i)).toBeNull();
  });

  it('disables the physical amount controls while an additive request is pending', async () => {
    const user = userEvent.setup();
    let resolveAdd: ((cart: Cart) => void) | undefined;
    const transport = createTransport(cartWithAmount(100_000), {
      add: vi.fn(
        () =>
          new Promise<Cart>((resolve) => {
            resolveAdd = resolve;
          }),
      ),
    });
    renderControl('in-stock', transport);

    await waitFor(() =>
      expect(screen.getAllByLabelText('Quantity').at(-1)).toBeEnabled(),
    );
    const input = screen.getAllByLabelText('Quantity').at(-1);
    if (!input) throw new Error('Quantity input missing');
    await user.clear(input);
    await user.type(input, '0.2');
    await user.click(
      screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
    );

    expect(screen.getAllByLabelText('Quantity').at(-1)).toBeDisabled();
    expect(screen.getByText('Updating cart…')).toBeVisible();

    resolveAdd?.(cartWithAmount(300_000));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
      ).toBeEnabled(),
    );
    expect(transport.add).toHaveBeenCalledWith(productSlug, 200_000);
    expect(screen.queryByText(/in cart/i)).toBeNull();
  });

  it('refreshes after a failed add and keeps expired lines visible', async () => {
    const user = userEvent.setup();
    const expired = cartWithAmount(100_000);
    expired.items[0].availability = 'unavailable';
    expired.items[0].reservationStatus = 'expired';
    const transport = createTransport(cartWithAmount(100_000), {
      load: vi
        .fn()
        .mockResolvedValueOnce(cartWithAmount(100_000))
        .mockResolvedValueOnce(cartWithAmount(100_000)),
      add: vi.fn(async () => {
        throw new Error('planned failure');
      }),
    });
    renderControl('in-stock', transport);

    await waitFor(() =>
      expect(screen.getAllByLabelText('Quantity').at(-1)).toBeEnabled(),
    );
    const input = screen.getAllByLabelText('Quantity').at(-1);
    if (!input) throw new Error('Quantity input missing');
    await user.clear(input);
    await user.type(input, '0.2');
    await user.click(
      screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(
          'Your cart was refreshed after the change could not be completed.',
        ),
      ).toBeVisible(),
    );

    renderControl('in-stock', createTransport(expired));
    expect(await screen.findByText('Reservation expired')).toBeVisible();
    expect(screen.queryByText('Out of stock')).toBeNull();
    expect(screen.getAllByLabelText('Quantity').at(-1)).toBeDisabled();
  });
});
