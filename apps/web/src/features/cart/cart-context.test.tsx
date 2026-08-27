import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useEffect, useRef } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { CartProvider, useCart } from './cart-context';
import type { Cart, CartTransport } from './cart-transport';

const initialCart: Cart = {
  adjustmentMessage: null,
  checkoutEligible: true,
  currency: 'USD' as const,
  distinctItemCount: 1,
  items: [
    {
      availability: 'available' as const,
      priceMinor: 599,
      imagePath: '/assets/products/citra-hops.webp',
      kitYieldVolumeMl: null,
      lineTotalMinor: 599,
      maximumOrderAmount: 100_000_000,
      minimumOrderAmount: 100_000,
      name: 'Citra Hops',
      orderStepAmount: 100_000,
      packageNetWeightMg: null,
      priceBasisAmount: 100_000,
      priceQualifier: 'per 100g',
      productId: '10000000-0000-4000-8000-000000000001',
      productSlug: 'citra-hops',
      amount: 100_000,
      reservationExpiresAt: '2026-08-25T10:15:00.000Z',
      reservationStatus: 'active',
      saleKind: 'WEIGHT',
      stockAmount: 100_000_000,
      amountUnit: 'MILLIGRAM',
    },
  ],
  serverNow: '2026-08-25T10:00:00.000Z',
  subtotalMinor: 599,
};

const emptyCart: Cart = {
  ...initialCart,
  checkoutEligible: false,
  distinctItemCount: 0,
  items: [],
  subtotalMinor: 0,
};

const updatedCart: Cart = {
  ...initialCart,
  items: [{ ...initialCart.items[0], lineTotalMinor: 1198, amount: 200_000 }],
  subtotalMinor: 1198,
};

describe('CartProvider', () => {
  it('coalesces simultaneous initial-load requests from multiple consumers', async () => {
    let resolveLoad: ((value: Cart) => void) | undefined;
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi.fn(
        () =>
          new Promise<Cart>((resolve) => {
            resolveLoad = resolve;
          }),
      ),
      recheck: vi.fn(async () => initialCart),
      remove: vi.fn(async () => initialCart),
      update: vi.fn(async () => initialCart),
    };
    render(
      <CartProvider transport={transport}>
        <EnsureLoadedProbe label="header" />
        <EnsureLoadedProbe label="product" />
      </CartProvider>,
    );

    await waitFor(() => expect(transport.load).toHaveBeenCalledTimes(1));
    resolveLoad?.(initialCart);

    expect(await screen.findByText('header ready')).toBeVisible();
    expect(screen.getByText('product ready')).toBeVisible();
    expect(transport.load).toHaveBeenCalledTimes(1);
  });

  it('loads once when a cart consumer requests canonical state', async () => {
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi.fn(async () => initialCart),
      recheck: vi.fn(async () => initialCart),
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
      recheck: vi.fn(async () => initialCart),
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

    expect(screen.getByTestId('quantity')).toHaveTextContent('200000');
    expect(screen.getByTestId('totals')).toHaveTextContent('refreshing');
    expect(transport.update).toHaveBeenCalledTimes(1);

    resolveUpdate?.({ ...initialCart, subtotalMinor: 1198 });
    await waitFor(() =>
      expect(screen.getByTestId('totals')).toHaveTextContent('canonical'),
    );
    expect(screen.getByTestId('subtotal')).toHaveTextContent('1198');
  });

  it('rolls back to a freshly loaded canonical cart after a mutation failure', async () => {
    const user = userEvent.setup();
    const canonical = { ...initialCart, subtotalMinor: 599 };
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi
        .fn()
        .mockResolvedValueOnce(initialCart)
        .mockResolvedValueOnce(canonical),
      recheck: vi.fn(async () => initialCart),
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
      expect(screen.getByTestId('quantity')).toHaveTextContent('100000'),
    );
    expect(transport.load).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('message')).toHaveTextContent('refreshed');
  });

  it('rolls back a first add after the API rejects and reports the recovery', async () => {
    const user = userEvent.setup();
    const transport: CartTransport = {
      add: vi.fn(async () => {
        throw new Error('planned add failure');
      }),
      clear: vi.fn(async () => emptyCart),
      load: vi
        .fn()
        .mockResolvedValueOnce(emptyCart)
        .mockResolvedValueOnce(emptyCart),
      recheck: vi.fn(async () => emptyCart),
      remove: vi.fn(async () => emptyCart),
      update: vi.fn(async () => emptyCart),
    };
    render(
      <CartProvider transport={transport}>
        <Probe />
      </CartProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(screen.getByTestId('item-count')).toHaveTextContent('0'),
    );
    expect(transport.add).toHaveBeenCalledWith('citra-hops', 100_000);
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
      recheck: vi.fn(async () => initialCart),
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
    let resolveRetry: ((value: Cart) => void) | undefined;
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi
        .fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockImplementationOnce(
          () =>
            new Promise<Cart>((resolve) => {
              resolveRetry = resolve;
            }),
        ),
      recheck: vi.fn(async () => initialCart),
      remove: vi.fn(async () => initialCart),
      update: vi.fn(async () => initialCart),
    };
    render(
      <CartProvider transport={transport}>
        <RetryProbe />
      </CartProvider>,
    );

    await screen.findByText('unavailable');
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(transport.load).toHaveBeenCalledTimes(2));
    resolveRetry?.(initialCart);

    await waitFor(() =>
      expect(screen.getByTestId('subtotal')).toHaveTextContent('599'),
    );
    expect(transport.load).toHaveBeenCalledTimes(2);
  });

  it('keeps recheck server-authoritative and exposes its canonical adjustment message', async () => {
    const user = userEvent.setup();
    let resolveRecheck: ((value: Cart) => void) | undefined;
    const recheckedCart: Cart = {
      ...initialCart,
      adjustmentMessage: 'Citra Hops quantity was adjusted to available stock.',
      items: [{ ...initialCart.items[0], amount: 100_000 }],
    };
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi.fn(async () => initialCart),
      recheck: vi.fn(
        () =>
          new Promise<Cart>((resolve) => {
            resolveRecheck = resolve;
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

    await user.click(await screen.findByRole('button', { name: 'Recheck' }));

    expect(screen.getByTestId('pending')).toHaveTextContent('recheck');
    expect(screen.getByTestId('totals')).toHaveTextContent('refreshing');
    expect(screen.getByTestId('quantity')).toHaveTextContent('100000');

    resolveRecheck?.(recheckedCart);

    await waitFor(() =>
      expect(screen.getByTestId('message')).toHaveTextContent(
        'adjusted to available stock',
      ),
    );
    expect(transport.recheck).toHaveBeenCalledTimes(1);
    expect(transport.load).toHaveBeenCalledTimes(1);
  });

  it.each([
    {
      action: 'Add',
      expectedCart: initialCart,
      initial: emptyCart,
      method: 'add',
    },
    {
      action: 'Remove',
      expectedCart: emptyCart,
      initial: initialCart,
      method: 'remove',
    },
    {
      action: 'Clear',
      expectedCart: emptyCart,
      initial: initialCart,
      method: 'clear',
    },
    {
      action: 'Update',
      expectedCart: updatedCart,
      initial: initialCart,
      method: 'update',
    },
  ] as const)(
    'uses the provider $method operation and reconciles its canonical response',
    async ({ action, expectedCart, initial, method }) => {
      const user = userEvent.setup();
      const transport: CartTransport = {
        add: vi.fn(async () => (method === 'add' ? expectedCart : initial)),
        clear: vi.fn(async () => (method === 'clear' ? expectedCart : initial)),
        load: vi.fn(async () => initial),
        recheck: vi.fn(async () => initial),
        remove: vi.fn(async () =>
          method === 'remove' ? expectedCart : initial,
        ),
        update: vi.fn(async () =>
          method === 'update' ? expectedCart : initial,
        ),
      };
      render(
        <CartProvider transport={transport}>
          <Probe />
        </CartProvider>,
      );

      await screen.findByRole('button', { name: action });
      await user.click(screen.getByRole('button', { name: action }));

      await waitFor(() =>
        expect(screen.getByTestId('item-count')).toHaveTextContent(
          String(expectedCart.items.length),
        ),
      );
      expect(transport[method]).toHaveBeenCalledTimes(1);
    },
  );

  it('settles a mutation before a requested refresh and permits the next mutation', async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((value: Cart) => void) | undefined;
    const transport: CartTransport = {
      add: vi.fn(async () => initialCart),
      clear: vi.fn(async () => initialCart),
      load: vi
        .fn()
        .mockResolvedValueOnce(initialCart)
        .mockResolvedValueOnce(updatedCart),
      recheck: vi.fn(async () => initialCart),
      remove: vi.fn(async () => initialCart),
      update: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<Cart>((resolve) => {
              resolveUpdate = resolve;
            }),
        )
        .mockResolvedValueOnce(updatedCart),
    };
    render(
      <CartProvider transport={transport}>
        <Probe />
      </CartProvider>,
    );

    await screen.findByRole('button', { name: 'Update' });
    await user.click(screen.getByRole('button', { name: 'Update' }));
    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    expect(transport.load).toHaveBeenCalledTimes(1);
    resolveUpdate?.(updatedCart);

    await waitFor(() => expect(transport.load).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.getByTestId('totals')).toHaveTextContent('canonical'),
    );

    await user.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(transport.update).toHaveBeenCalledTimes(2));
  });
});

function EnsureLoadedProbe({ label }: Readonly<{ label: string }>) {
  const { ensureLoaded, state } = useCart();

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  return <output>{`${label} ${state.kind}`}</output>;
}

function RetryProbe() {
  const { ensureLoaded, refresh, state } = useCart();

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  if (state.kind !== 'ready') {
    return (
      <>
        <output>{state.kind}</output>
        <button onClick={() => void refresh()} type="button">
          Refresh
        </button>
      </>
    );
  }

  return <output data-testid="subtotal">{state.cart.subtotalMinor}</output>;
}

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
      <output data-testid="quantity">{cart.items[0]?.amount}</output>
      <output data-testid="totals">
        {cart.totalsAreRefreshing ? 'refreshing' : 'canonical'}
      </output>
      <output data-testid="subtotal">{cart.state.cart.subtotalMinor}</output>
      <output data-testid="item-count">{cart.items.length}</output>
      <output data-testid="message">{cart.state.message ?? ''}</output>
      <output data-testid="pending">{cart.pending?.kind ?? ''}</output>
      <button onClick={() => void cart.refresh()} type="button">
        Refresh
      </button>
      <button onClick={() => void cart.recheck()} type="button">
        Recheck
      </button>
      <button
        onClick={() => void cart.add('citra-hops', 100_000)}
        type="button"
      >
        Add
      </button>
      <button
        onClick={() => void cart.update('citra-hops', 200_000)}
        type="button"
      >
        Update
      </button>
      <button onClick={() => void cart.remove('citra-hops')} type="button">
        Remove
      </button>
      <button onClick={() => void cart.clear()} type="button">
        Clear
      </button>
    </>
  );
}
