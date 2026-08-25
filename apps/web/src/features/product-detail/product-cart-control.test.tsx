import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CartProvider } from '../cart/cart-context';
import type { Cart, CartTransport } from '../cart/cart-transport';
import { ProductCartControl } from './product-cart-control';

const productName = 'Citra Hops';
const productSlug = 'citra-hops';

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

function cartWithQuantity(quantity: number): Cart {
  return {
    ...emptyCart,
    checkoutEligible: true,
    distinctItemCount: 1,
    items: [
      {
        availability: 'available',
        currentUnitPriceMinor: 599,
        imagePath: '/assets/products/citra-hops.webp',
        lineTotalMinor: 599 * quantity,
        name: productName,
        priceQualifier: 'per 100g',
        productId: '10000000-0000-4000-8000-000000000001',
        productSlug,
        quantity,
        reservationExpiresAt: '2026-08-25T10:15:00.000Z',
        reservationStatus: 'active',
      },
    ],
    subtotalMinor: 599 * quantity,
    totalQuantity: quantity,
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
  product: Pick<Parameters<typeof ProductCartControl>[0], 'availability'> = {
    availability: 'in-stock',
  },
  transport: CartTransport = createTransport(emptyCart),
) {
  return render(
    <CartProvider transport={transport}>
      <ProductCartControl
        availability={product.availability}
        productName={productName}
        productSlug={productSlug}
      />
    </CartProvider>,
  );
}

describe('ProductCartControl', () => {
  it('shows Add to Cart for an absent product and adds as a guest without auth UI', async () => {
    const user = userEvent.setup();
    const addedCart = cartWithQuantity(1);
    const transport = createTransport(emptyCart, {
      add: vi.fn(async () => addedCart),
    });
    renderControl(undefined, transport);

    expect(
      await screen.findByRole('button', { name: 'Add to Cart' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Add to Cart' }));

    await waitFor(() => expect(screen.getByText('1 in cart')).toBeVisible());
    expect(transport.add).toHaveBeenCalledWith(productSlug, 1);
    expect(
      screen.queryByRole('link', { name: /sign in/i }),
    ).not.toBeInTheDocument();
  });

  it('updates plus and minus, then removes when quantity reaches one', async () => {
    const user = userEvent.setup();
    const quantityTwo = cartWithQuantity(2);
    const quantityThree = cartWithQuantity(3);
    const quantityOne = cartWithQuantity(1);
    const update = vi
      .fn()
      .mockResolvedValueOnce(quantityThree)
      .mockResolvedValueOnce(quantityTwo)
      .mockResolvedValueOnce(quantityOne);
    const remove = vi.fn(async () => emptyCart);
    const transport = createTransport(quantityTwo, { remove, update });
    renderControl(undefined, transport);

    await user.click(
      await screen.findByRole('button', {
        name: 'Increase Citra Hops quantity',
      }),
    );
    await waitFor(() => expect(screen.getByText('3 in cart')).toBeVisible());
    await user.click(
      screen.getByRole('button', { name: 'Decrease Citra Hops quantity' }),
    );
    await waitFor(() => expect(screen.getByText('2 in cart')).toBeVisible());
    await user.click(
      screen.getByRole('button', { name: 'Decrease Citra Hops quantity' }),
    );
    await waitFor(() => expect(screen.getByText('1 in cart')).toBeVisible());
    await user.click(
      screen.getByRole('button', { name: 'Decrease Citra Hops quantity' }),
    );
    await waitFor(() =>
      expect(screen.queryByText('1 in cart')).not.toBeInTheDocument(),
    );

    expect(update).toHaveBeenNthCalledWith(1, productSlug, 3);
    expect(update).toHaveBeenNthCalledWith(2, productSlug, 2);
    expect(update).toHaveBeenNthCalledWith(3, productSlug, 1);
    expect(remove).toHaveBeenCalledWith(productSlug);
  });

  it('disables pending controls with honest accessible labels', async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((value: Cart) => void) | undefined;
    const transport = createTransport(cartWithQuantity(1), {
      update: () =>
        new Promise<Cart>((resolve) => {
          resolveUpdate = resolve;
        }),
    });
    renderControl(undefined, transport);

    await user.click(
      await screen.findByRole('button', {
        name: 'Increase Citra Hops quantity',
      }),
    );
    expect(
      screen.getByRole('button', { name: 'Increase Citra Hops quantity' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Decrease Citra Hops quantity' }),
    ).toBeDisabled();
    expect(
      screen.getByText('Updating cart…').closest('[role="status"]'),
    ).toHaveTextContent('Updating cart…');

    resolveUpdate?.(cartWithQuantity(2));
    await waitFor(() => expect(screen.getByText('2 in cart')).toBeVisible());
  });

  it('rolls back after an API failure and exposes safe feedback', async () => {
    const user = userEvent.setup();
    const transport = createTransport(cartWithQuantity(1), {
      load: vi
        .fn()
        .mockResolvedValueOnce(cartWithQuantity(1))
        .mockResolvedValueOnce(cartWithQuantity(1)),
      update: vi.fn(async () => {
        throw new Error('planned failure');
      }),
    });
    renderControl(undefined, transport);

    await user.click(
      await screen.findByRole('button', {
        name: 'Increase Citra Hops quantity',
      }),
    );
    await waitFor(() => expect(screen.getByText('1 in cart')).toBeVisible());
    const message = screen.getByText(
      'Your cart was refreshed after the change could not be completed.',
    );
    expect(message.closest('[role="status"]')).toHaveTextContent('refreshed');
    expect(
      screen.queryByText(/csrf|token|stack|fetch/i),
    ).not.toBeInTheDocument();
  });

  it('does not offer an enabled add action or raw stock/reservation details out of stock', async () => {
    const transport = createTransport(emptyCart);
    renderControl({ availability: 'out-of-stock' }, transport);

    const add = await screen.findByRole('button', { name: 'Add to Cart' });
    expect(add).toBeDisabled();
    expect(screen.getByText('Out of stock')).toBeVisible();
    expect(
      screen.queryByText(
        /stock quantity|reservations expire|reservation countdown/i,
      ),
    ).not.toBeInTheDocument();
    expect(transport.add).not.toHaveBeenCalled();
  });

  it('keeps an expired unavailable line visible without calling it out of stock', async () => {
    const expired = cartWithQuantity(1);
    expired.items[0].availability = 'unavailable';
    expired.items[0].reservationStatus = 'expired';
    const transport = createTransport(expired);
    renderControl(undefined, transport);

    await waitFor(() => expect(screen.getByText('1 in cart')).toBeVisible());
    expect(screen.getByText('Reservation expired')).toBeVisible();
    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Decrease Citra Hops quantity' }),
    ).toBeDisabled();
  });

  it('renders the canonical adjustment message as a live status', async () => {
    const adjustedCart = {
      ...cartWithQuantity(1),
      adjustmentMessage: 'Citra Hops was adjusted to available stock.',
    };
    renderControl(undefined, createTransport(adjustedCart));

    const message = await screen.findByText(
      'Citra Hops was adjusted to available stock.',
    );
    const status = message.closest('[role="status"]');
    expect(status).not.toBeNull();
    expect(status).toHaveAttribute('role', 'status');
  });
});
