import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CartProvider, type CartState } from './cart-context';
import { CartScreen } from './cart-screen';
import type { Cart, CartTransport, CheckoutReadiness } from './cart-transport';

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

const cart: Cart = {
  currency: 'EUR',
  distinctItemCount: 1,
  items: [
    {
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
      saleKind: 'WEIGHT',
      stockAmount: 100_000_000,
      amountUnit: 'MILLIGRAM',
    },
  ],
  subtotalMinor: 599,
};

const routeStates: readonly (readonly [string, CartState])[] = [
  ['loading', { kind: 'loading' }],
  ['unavailable', { kind: 'unavailable' }],
  [
    'empty',
    {
      cart: {
        ...cart,
        distinctItemCount: 0,
        items: [],
        subtotalMinor: 0,
      },
      kind: 'ready',
    },
  ],
  ['ready', { cart, kind: 'ready' }],
];

afterEach(() => {
  push.mockReset();
  vi.useRealTimers();
});

const unavailableReadiness: CheckoutReadiness = {
  checkedAt: '2026-08-25T12:00:00.000Z',
  lines: [
    {
      outcome: 'insufficient_stock',
      productSlug: 'citra-hops',
      requestedAmount: 100_000,
    },
  ],
  status: 'unavailable',
};

describe('CartScreen', () => {
  it.each(routeStates)(
    'exposes exactly one meaningful route heading in the %s state',
    (_stateName, initialState) => {
      render(<CartScreen initialState={initialState} />);

      expect(
        screen.getAllByRole('heading', { level: 1, name: 'Shopping Cart' }),
      ).toHaveLength(1);
    },
  );

  it('uses the immediate cart contract and keeps checkout as a bounded handoff', () => {
    render(<CartScreen initialState={{ cart, kind: 'ready' }} />);

    expect(
      screen.getByText(
        (_content, element) =>
          element?.tagName === 'P' && element.textContent === '€5.99 per 100g',
      ),
    ).toBeVisible();
    expect(screen.getByLabelText('Quantity')).toHaveValue('0.1');
    expect(screen.queryByText(/selected$/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Selection price')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Update Citra Hops' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Citra Hops' })).toHaveAttribute(
      'href',
      '/product/citra-hops',
    );
    expect(
      screen.getByRole('link', { name: 'View Citra Hops' }),
    ).toHaveAttribute('href', '/product/citra-hops');
    expect(screen.getByRole('button', { name: 'Clear cart' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove Citra Hops from cart' }),
    ).toHaveTextContent('Remove');
    expect(
      screen.getByRole('button', { name: 'Proceed to Checkout' }),
    ).toBeVisible();
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Shipping address')).not.toBeInTheDocument();
  });

  it('keeps every cart control available and reports a business outcome inline', async () => {
    const user = userEvent.setup();
    const checkoutReadiness = vi.fn(async () => unavailableReadiness);
    const transport = createTransport(cart, { checkoutReadiness });
    render(
      <CartProvider transport={transport}>
        <CartScreen />
      </CartProvider>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Proceed to Checkout' }),
    );

    expect(checkoutReadiness).toHaveBeenCalledTimes(1);
    expect(
      screen.getByText('This amount is not currently available.'),
    ).toBeVisible();
    expect(screen.getByText('Availability needs attention')).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Proceed to Checkout' }),
    ).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Clear cart' })).toBeEnabled();
    expect(
      screen.getByRole('button', { name: 'Remove Citra Hops from cart' }),
    ).toBeEnabled();
    expect(screen.getByLabelText('Citra Hops quantity')).toBeEnabled();
    expect(push).not.toHaveBeenCalled();
  });

  it('uses the checkout action for an availability preflight and navigates only when ready', async () => {
    const user = userEvent.setup();
    let resolveReadiness: ((value: CheckoutReadiness) => void) | undefined;
    const transport = createTransport(cart, {
      checkoutReadiness: vi.fn(
        () =>
          new Promise<CheckoutReadiness>((resolve) => {
            resolveReadiness = resolve;
          }),
      ),
    });
    render(
      <CartProvider transport={transport}>
        <CartScreen />
      </CartProvider>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Proceed to Checkout' }),
    );

    expect(
      screen.getByRole('button', { name: 'Checking availability…' }),
    ).toBeDisabled();
    expect(transport.checkoutReadiness).toHaveBeenCalledTimes(1);

    resolveReadiness?.({
      checkedAt: '2026-08-25T12:00:00.000Z',
      lines: [
        {
          outcome: 'available',
          productSlug: 'citra-hops',
          requestedAmount: 100_000,
        },
      ],
      status: 'ready',
    });

    await waitFor(() => expect(push).toHaveBeenCalledWith('/checkout'));
  });

  it('keeps the primary action recoverable after a transport failure', async () => {
    const user = userEvent.setup();
    const checkoutReadiness = vi.fn(async () => {
      throw new Error('offline');
    });
    const transport = createTransport(cart, { checkoutReadiness });
    render(
      <CartProvider transport={transport}>
        <CartScreen />
      </CartProvider>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Proceed to Checkout' }),
    );

    expect(
      await screen.findByText('We couldn’t check availability. Try again.'),
    ).toHaveAttribute('role', 'alert');
    expect(
      screen.getByRole('button', { name: 'Proceed to Checkout' }),
    ).toBeEnabled();
    await user.click(
      screen.getByRole('button', { name: 'Proceed to Checkout' }),
    );
    expect(checkoutReadiness).toHaveBeenCalledTimes(2);
    expect(push).not.toHaveBeenCalled();
  });

  it('updates line and cart totals immediately while preserving the mounted cart through reconciliation', async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((value: Cart) => void) | undefined;
    const updatedCart: Cart = {
      ...cart,
      items: [{ ...cart.items[0], lineTotalMinor: 1198, amount: 200_000 }],
      subtotalMinor: 1198,
    };
    const transport = createTransport(cart, {
      update: () =>
        new Promise<Cart>((resolve) => {
          resolveUpdate = resolve;
        }),
    });
    render(
      <CartProvider transport={transport}>
        <CartScreen />
      </CartProvider>,
    );

    const productImageLink = await screen.findByRole('link', {
      name: 'View Citra Hops',
    });
    await user.click(
      screen.getByRole('button', { name: 'Increase weight amount' }),
    );

    expect(screen.getByLabelText('Quantity')).toHaveValue('0.2');
    expect(screen.getAllByText('€11.98')).toHaveLength(2);
    expect(
      screen.queryByText(/updating from the store/i),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Proceed to Checkout' }),
    ).toBeDisabled();

    await act(async () => {
      resolveUpdate?.(updatedCart);
    });

    expect(screen.getByLabelText('Quantity')).toHaveValue('0.2');
    expect(screen.getByRole('link', { name: 'View Citra Hops' })).toBe(
      productImageLink,
    );
    expect(
      screen.getByRole('button', { name: 'Proceed to Checkout' }),
    ).toBeEnabled();
  });
});

function createTransport(
  loadedCart: Cart,
  overrides: Partial<CartTransport> = {},
): CartTransport {
  return {
    add: vi.fn(async () => loadedCart),
    checkoutReadiness: vi.fn(async () => ({
      checkedAt: '2026-08-25T12:00:00.000Z',
      lines: [],
      status: 'ready' as const,
    })),
    clear: vi.fn(async () => loadedCart),
    load: vi.fn(async () => loadedCart),
    remove: vi.fn(async () => loadedCart),
    update: vi.fn(async () => loadedCart),
    ...overrides,
  };
}
