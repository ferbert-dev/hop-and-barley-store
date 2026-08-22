import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CartProvider } from './cart-context';
import { CartScreen } from './cart-screen';
import type { CartTransport } from './cart-transport';

const push = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

const cart = {
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

beforeEach(() => push.mockReset());

describe('CartScreen', () => {
  it('renders the accessible loading state before the canonical cart arrives', () => {
    render(<CartScreen initialState={{ kind: 'loading' }} />);

    expect(screen.getByRole('status')).toBeVisible();
    expect(
      screen.getByRole('heading', { name: 'Loading your cart' }),
    ).toBeVisible();
  });

  it('requires contact and shipping details before the bounded checkout handoff', async () => {
    const user = userEvent.setup();
    render(
      <CartScreen
        initialState={{
          cart,
          kind: 'ready',
        }}
      />,
    );

    await user.click(
      screen.getByRole('button', { name: 'Continue to checkout' }),
    );

    expect(screen.getByText('Enter your full name.')).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  it('navigates to the bounded checkout route without serialising contact details', async () => {
    const user = userEvent.setup();
    render(<CartScreen initialState={{ cart, kind: 'ready' }} />);

    await user.type(screen.getByLabelText('Full name'), 'Ada Brewer');
    await user.type(screen.getByLabelText('Phone number'), '+34 600 123 456');
    await user.type(screen.getByLabelText('City'), 'Madrid');
    await user.type(
      screen.getByLabelText('Shipping address'),
      'Calle de la Malta 12',
    );
    await user.click(
      screen.getByRole('button', { name: 'Continue to checkout' }),
    );

    expect(push).toHaveBeenCalledWith('/checkout');
    expect(JSON.stringify(push.mock.calls)).not.toContain('Ada Brewer');
    expect(JSON.stringify(push.mock.calls)).not.toContain('Calle de la Malta');
  });

  it('withholds a changing line total until the cart API returns a canonical response', async () => {
    const user = userEvent.setup();
    let resolveUpdate: ((value: typeof cart) => void) | undefined;
    const transport: CartTransport = {
      add: vi.fn(async () => cart),
      clear: vi.fn(async () => cart),
      load: vi.fn(async () => cart),
      remove: vi.fn(async () => cart),
      update: vi.fn(
        () =>
          new Promise<typeof cart>((resolve) => {
            resolveUpdate = resolve;
          }),
      ),
    };
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
    resolveUpdate?.({ ...cart, subtotalMinor: 1198, totalQuantity: 2 });
  });
});
