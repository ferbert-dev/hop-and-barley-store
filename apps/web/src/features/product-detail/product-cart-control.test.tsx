import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CartProvider } from '../cart/cart-context';
import type {
  Cart,
  CartTransport,
  CheckoutReadiness,
} from '../cart/cart-transport';
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
  currency: 'USD',
  distinctItemCount: 0,
  items: [],
  subtotalMinor: 0,
};

const readyReadiness: CheckoutReadiness = {
  checkedAt: '2026-08-25T10:00:00.000Z',
  lines: [],
  status: 'ready',
};

const originalShowModal = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'showModal',
);
const originalClose = Object.getOwnPropertyDescriptor(
  HTMLDialogElement.prototype,
  'close',
);

beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.setAttribute('open', '');
      this.querySelector<HTMLElement>('button')?.focus();
    },
  });
  Object.defineProperty(HTMLDialogElement.prototype, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.removeAttribute('open');
    },
  });
});

afterEach(() => {
  cleanup();
  if (originalShowModal) {
    Object.defineProperty(
      HTMLDialogElement.prototype,
      'showModal',
      originalShowModal,
    );
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'showModal');
  }
  if (originalClose) {
    Object.defineProperty(HTMLDialogElement.prototype, 'close', originalClose);
  } else {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'close');
  }
});

function cartWithAmount(amount: number): Cart {
  const lineTotalMinor = (amount / 100_000) * 599;
  return {
    ...emptyCart,
    distinctItemCount: 1,
    items: [
      {
        ...quantityMetadata,
        amount,
        priceMinor: 599,
        imagePath: '/assets/products/citra-hops.webp',
        lineTotalMinor,
        name: productName,
        priceQualifier: 'per 100g',
        productId: '10000000-0000-4000-8000-000000000001',
        productSlug,
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
    checkoutReadiness: vi.fn(async () => readyReadiness),
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
  it('confirms a successful add, exposes the canonical amount, and restores focus when shopping continues', async () => {
    const user = userEvent.setup();
    const transport = createTransport(emptyCart, {
      add: vi.fn(async () => cartWithAmount(200_000)),
    });
    renderControl('in-stock', transport);

    await screen.findAllByLabelText('Quantity (kg)');
    await waitFor(() =>
      expect(screen.getAllByLabelText('Quantity (kg)').at(-1)).toBeEnabled(),
    );
    const input = screen.getAllByLabelText('Quantity (kg)').at(-1);
    if (!input) throw new Error('Quantity input missing');
    await user.clear(input);
    await user.type(input, '0.2');
    await user.click(
      screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
    );

    const dialog = await screen.findByRole('dialog', {
      name: 'Citra Hops added to your cart',
    });
    expect(dialog).toHaveAccessibleDescription(
      'Your cart now contains 200g of Citra Hops.',
    );
    expect(transport.add).toHaveBeenCalledWith(productSlug, 200_000);
    expect(screen.getByRole('link', { name: 'In cart: 200g' })).toHaveAttribute(
      'href',
      '/cart',
    );
    expect(dialog).toContainElement(
      screen.getByRole('link', { name: 'Go to cart' }),
    );
    expect(screen.getByRole('link', { name: 'Go to cart' })).toHaveAttribute(
      'href',
      '/cart',
    );
    await user.click(screen.getByRole('button', { name: 'Continue shopping' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
    ).toHaveFocus();
    expect(screen.queryByRole('link', { name: /sign in/i })).toBeNull();
  });

  it('adds the selection to an existing line without replacing it', async () => {
    const user = userEvent.setup();
    const transport = createTransport(cartWithAmount(100_000), {
      add: vi.fn(async () => cartWithAmount(300_000)),
    });
    renderControl('in-stock', transport);

    await screen.findAllByLabelText('Quantity (kg)');
    await waitFor(() =>
      expect(screen.getAllByLabelText('Quantity (kg)').at(-1)).toBeEnabled(),
    );
    const input = screen.getAllByLabelText('Quantity (kg)').at(-1);
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
    expect(
      await screen.findByRole('dialog', {
        name: 'Citra Hops added to your cart',
      }),
    ).toHaveAccessibleDescription('Your cart now contains 300g of Citra Hops.');
    expect(screen.getByRole('link', { name: 'In cart: 300g' })).toBeVisible();
  });

  it('keeps Add to Cart available regardless of catalog availability', async () => {
    renderControl('out-of-stock');

    expect(
      await screen.findByRole('button', { name: 'Add Citra Hops to Cart' }),
    ).toBeEnabled();
    expect(screen.queryByText('Out of stock')).toBeNull();
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
      expect(screen.getAllByLabelText('Quantity (kg)').at(-1)).toBeEnabled(),
    );
    const input = screen.getAllByLabelText('Quantity (kg)').at(-1);
    if (!input) throw new Error('Quantity input missing');
    await user.clear(input);
    await user.type(input, '0.2');
    await user.click(
      screen.getByRole('button', { name: 'Add Citra Hops to Cart' }),
    );

    expect(screen.getAllByLabelText('Quantity (kg)').at(-1)).toBeDisabled();
    expect(screen.getByText('Updating cart…')).toBeVisible();

    resolveAdd?.(cartWithAmount(300_000));
    await screen.findByRole('dialog', {
      name: 'Citra Hops added to your cart',
    });
    expect(transport.add).toHaveBeenCalledWith(productSlug, 200_000);
    expect(screen.getByRole('link', { name: 'In cart: 300g' })).toBeVisible();
  });

  it('refreshes after a failed add without turning a cart state into a stock gate', async () => {
    const user = userEvent.setup();
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
      expect(screen.getAllByLabelText('Quantity (kg)').at(-1)).toBeEnabled(),
    );
    const input = screen.getAllByLabelText('Quantity (kg)').at(-1);
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

    expect(screen.getAllByLabelText('Quantity (kg)').at(-1)).toBeEnabled();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('link', { name: 'In cart: 100g' })).toBeVisible();
  });
});
