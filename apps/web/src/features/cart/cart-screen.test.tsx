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
      reservationExpiresAt: '2026-08-25T12:15:00.000Z',
      reservationStatus: 'active',
      saleKind: 'WEIGHT',
      stockAmount: 100_000_000,
      amountUnit: 'MILLIGRAM',
    },
  ],
  serverNow: '2026-08-25T12:00:00.000Z',
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
        checkoutEligible: false,
        distinctItemCount: 0,
        items: [],
        subtotalMinor: 0,
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

    expect(screen.getByText('100g selected')).toBeVisible();
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

  it('retains canonically expired lines without falsely claiming zero stock', () => {
    const expiredCart: Cart = {
      ...cart,
      checkoutEligible: false,
      items: [
        {
          ...cart.items[0],
          availability: 'unavailable',
          reservationExpiresAt: '2026-08-25T12:00:00.000Z',
          reservationStatus: 'expired',
        },
      ],
    };
    render(<CartScreen initialState={{ cart: expiredCart, kind: 'ready' }} />);

    expect(screen.getByText('Citra Hops')).toBeVisible();
    expect(
      screen.getByText(
        'Reservations expired. Recheck availability before checkout.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('link', { name: 'Proceed to Checkout' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Out of stock')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Remove unavailable items before checkout.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('Recheck availability before checkout.'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Decrease weight amount' }),
    ).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Increase weight amount' }),
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
          availability: 'unavailable',
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
          priceMinor: null,
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

    await user.clear(await screen.findByLabelText('Quantity'));
    await user.type(screen.getByLabelText('Quantity'), '0.2');
    await user.click(screen.getByRole('button', { name: 'Update Citra Hops' }));

    expect(
      screen.getByText('Line total updating from the store…'),
    ).toBeVisible();
    expect(screen.getAllByText('Updating from the store…')).toHaveLength(1);

    await act(async () => {
      resolveUpdate?.(updatedCart);
    });

    expect(screen.getByText('200g selected')).toBeVisible();
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
