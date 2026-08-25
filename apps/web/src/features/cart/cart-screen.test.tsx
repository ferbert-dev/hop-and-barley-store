import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CartProvider, type CartState } from './cart-context';
import { CartScreen } from './cart-screen';
import type { Cart, CartTransport } from './cart-transport';

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

const cart: Cart = {
  adjustmentMessage: null,
  checkoutEligible: true,
  currency: 'USD',
  distinctItemCount: 1,
  items: [
    {
      availability: 'available',
      currentUnitPriceMinor: 599,
      imagePath: '/assets/products/citra-hops.webp',
      lineTotalMinor: 599,
      name: 'Citra Hops',
      priceQualifier: 'per 100g',
      productId: '10000000-0000-4000-8000-000000000001',
      productSlug: 'citra-hops',
      quantity: 1,
      reservationExpiresAt: '2026-08-25T12:15:00.000Z',
      reservationStatus: 'active',
    },
  ],
  serverNow: '2026-08-25T12:00:00.000Z',
  subtotalMinor: 599,
  totalQuantity: 1,
};

const routeStates: readonly (readonly [string, CartState])[] = [
  ['loading', { kind: 'loading' }],
  ['unavailable', { kind: 'unavailable' }],
  [
    'empty',
    {
      cart: {
        ...cart,
        checkoutEligible: false,
        distinctItemCount: 0,
        items: [],
        subtotalMinor: 0,
        totalQuantity: 0,
      },
      kind: 'ready',
    },
  ],
  ['ready', { cart, kind: 'ready' }],
];

afterEach(() => vi.useRealTimers());

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

  it('uses the confirmed cart labels and keeps checkout as a bounded handoff', () => {
    render(<CartScreen initialState={{ cart, kind: 'ready' }} />);

    expect(screen.getByText('1 in cart')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Clear cart' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove Citra Hops from cart' }),
    ).toHaveTextContent('Remove');
    expect(
      screen.getByRole('link', { name: 'Proceed to Checkout' }),
    ).toHaveAttribute('href', '/checkout');
    expect(screen.queryByLabelText('Full name')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Shipping address')).not.toBeInTheDocument();
  });

  it('derives the reservation countdown from server time despite a skewed client clock', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('1999-01-01T00:00:00.000Z'));
    render(<CartScreen initialState={{ cart, kind: 'ready' }} />);

    expect(screen.getByRole('timer')).toHaveTextContent(
      'Reservations expire in 15:00',
    );

    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(screen.getByRole('timer')).toHaveTextContent(
      'Reservations expire in 14:59',
    );
  });

  it('retains expired lines and exposes one cart-level availability recheck', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    const expiringCart: Cart = {
      ...cart,
      items: [
        {
          ...cart.items[0],
          reservationExpiresAt: '2026-08-25T12:00:02.000Z',
        },
      ],
    };
    render(<CartScreen initialState={{ cart: expiringCart, kind: 'ready' }} />);

    act(() => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByText('Citra Hops')).toBeVisible();
    expect(
      screen.getByText(
        'Reservations expired. Recheck availability before checkout.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Proceed to Checkout' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Decrease Citra Hops quantity' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Increase Citra Hops quantity' }),
    ).toBeDisabled();
  });

  it('keeps an out-of-stock line after recheck, announces the adjustment, and blocks checkout', async () => {
    const user = userEvent.setup();
    const expiredCart: Cart = {
      ...cart,
      checkoutEligible: false,
      items: [
        {
          ...cart.items[0],
          reservationStatus: 'expired',
        },
      ],
    };
    const recheckedCart: Cart = {
      ...expiredCart,
      adjustmentMessage: 'Citra Hops is no longer available.',
      items: [
        {
          ...expiredCart.items[0],
          availability: 'unavailable',
          currentUnitPriceMinor: null,
          lineTotalMinor: null,
          reservationExpiresAt: null,
          reservationStatus: 'unreserved',
        },
      ],
      serverNow: '2026-08-25T12:01:00.000Z',
      subtotalMinor: 0,
    };
    const recheck = vi.fn(async () => recheckedCart);
    const transport = createTransport(expiredCart, { recheck });
    render(
      <CartProvider transport={transport}>
        <CartScreen />
      </CartProvider>,
    );

    await screen.findByRole('button', { name: 'Recheck availability' });
    await user.click(
      screen.getByRole('button', { name: 'Recheck availability' }),
    );

    expect(recheck).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Out of stock')).toBeVisible();
    expect(
      screen.getByText('Citra Hops is no longer available.'),
    ).toBeVisible();
    expect(
      screen.getByText('Remove unavailable items before checkout.'),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Proceed to Checkout' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Citra Hops')).toBeVisible();
  });

  it('withholds changing totals until the cart API returns a canonical response', async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((value: Cart) => void) | undefined;
    const updatedCart: Cart = {
      ...cart,
      items: [{ ...cart.items[0], lineTotalMinor: 1198, quantity: 2 }],
      subtotalMinor: 1198,
      totalQuantity: 2,
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

    await screen.findByRole('button', { name: 'Increase Citra Hops quantity' });
    await user.click(
      screen.getByRole('button', { name: 'Increase Citra Hops quantity' }),
    );

    expect(
      screen.getByText('Line total updating from the store…'),
    ).toBeVisible();
    expect(screen.getAllByText('Updating from the store…')).toHaveLength(1);

    await act(async () => {
      resolveUpdate?.(updatedCart);
    });

    expect(screen.getByText('2 in cart')).toBeVisible();
    expect(
      screen.queryByText('Updating from the store…'),
    ).not.toBeInTheDocument();
  });
});

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
