import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CartProvider, useCart } from './cart-context';
import type { Cart, CartTransport } from './cart-transport';

const initialCart = {
  checkoutEligible: true,
  currency: 'USD' as const,
  distinctItemCount: 1,
  items: [
    {
      availability: 'available' as const,
      currentUnitPriceMinor: 599,
      imagePath: '/assets/products/citra-hops.webp',
      lineTotalMinor: 599,
      name: 'Citra Hops',
      priceQualifier: 'per 100g',
      productId: '10000000-0000-4000-8000-000000000001',
      productSlug: 'citra-hops',
      quantity: 1,
    },
  ],
  subtotalMinor: 599,
  totalQuantity: 1,
};

describe('CartProvider', () => {
  it('loads once when a cart consumer requests canonical state', async () => {
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi.fn(async () => initialCart),
      remove: vi.fn(async () => initialCart),
      update: vi.fn(async () => initialCart),
    };
    render(
      <CartProvider transport={transport}>
        <Probe />
      </CartProvider>,
    );

    await screen.findByRole('button', { name: 'Update' });
    await waitFor(() => expect(transport.load).toHaveBeenCalledTimes(1));
  });

  it('projects a quantity change immediately but withholds totals until the canonical response', async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((value: Cart) => void) | undefined;
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi.fn().mockResolvedValue(initialCart),
      remove: vi.fn(async () => initialCart),
      update: vi.fn(
        () =>
          new Promise<Cart>((resolve) => {
            resolveUpdate = resolve;
          }),
      ),
    };
    render(
      <CartProvider transport={transport}>
        <Probe />
      </CartProvider>,
    );

    await screen.findByRole('button', { name: 'Update' });
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await user.click(screen.getByRole('button', { name: 'Update' }));

    expect(screen.getByTestId('quantity')).toHaveTextContent('2');
    expect(screen.getByTestId('totals')).toHaveTextContent('refreshing');
    expect(transport.update).toHaveBeenCalledTimes(1);

    resolveUpdate?.({ ...initialCart, subtotalMinor: 1198, totalQuantity: 2 });
    await waitFor(() =>
      expect(screen.getByTestId('totals')).toHaveTextContent('canonical'),
    );
    expect(screen.getByTestId('subtotal')).toHaveTextContent('1198');
  });

  it('rolls back to a freshly loaded canonical cart after a mutation failure', async () => {
    const user = userEvent.setup();
    const canonical = { ...initialCart, subtotalMinor: 599, totalQuantity: 1 };
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi
        .fn()
        .mockResolvedValueOnce(initialCart)
        .mockResolvedValueOnce(canonical),
      remove: vi.fn(async () => initialCart),
      update: vi.fn(async () => {
        throw new Error('planned failure');
      }),
    };
    render(
      <CartProvider transport={transport}>
        <Probe />
      </CartProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Update' }));

    await waitFor(() =>
      expect(screen.getByTestId('quantity')).toHaveTextContent('1'),
    );
    expect(transport.load).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('message')).toHaveTextContent('refreshed');
  });

  it('ignores an earlier refresh response when a newer request wins', async () => {
    const user = userEvent.setup();
    let resolveFirst: ((value: Cart) => void) | undefined;
    let resolveSecond: ((value: Cart) => void) | undefined;
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Cart>((resolve) => {
              resolveFirst = resolve;
            }),
        )
        .mockImplementationOnce(
          () =>
            new Promise<Cart>((resolve) => {
              resolveSecond = resolve;
            }),
        ),
      remove: vi.fn(async () => initialCart),
      update: vi.fn(async () => initialCart),
    };
    render(
      <CartProvider transport={transport}>
        <Probe />
      </CartProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    resolveFirst?.({ ...initialCart, subtotalMinor: 999 });
    resolveSecond?.({ ...initialCart, subtotalMinor: 599 });

    await waitFor(() =>
      expect(screen.getByTestId('subtotal')).toHaveTextContent('599'),
    );
  });

  it('recovers an unavailable cart through the explicit retry action', async () => {
    const user = userEvent.setup();
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce(initialCart),
      remove: vi.fn(async () => initialCart),
      update: vi.fn(async () => initialCart),
    };
    render(
      <CartProvider transport={transport}>
        <Probe />
      </CartProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Refresh' }));

    await waitFor(() =>
      expect(screen.getByTestId('subtotal')).toHaveTextContent('599'),
    );
    expect(transport.load).toHaveBeenCalledTimes(2);
  });
});

function Probe() {
  const cart = useCart();
  const { refresh } = cart;
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    void refresh();
  }, [refresh]);

  if (cart.state.kind !== 'ready') {
    return (
      <button onClick={() => void cart.refresh()} type="button">
        Refresh
      </button>
    );
  }
  return (
    <>
      <output data-testid="quantity">{cart.items[0]?.quantity}</output>
      <output data-testid="totals">
        {cart.totalsAreRefreshing ? 'refreshing' : 'canonical'}
      </output>
      <output data-testid="subtotal">{cart.state.cart.subtotalMinor}</output>
      <output data-testid="message">{cart.state.message ?? ''}</output>
      <button onClick={() => void cart.update('citra-hops', 2)} type="button">
        Update
      </button>
    </>
  );
}
