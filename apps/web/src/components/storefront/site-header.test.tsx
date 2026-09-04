import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CartProvider, useCart } from '../../features/cart/cart-context';
import type { Cart, CartTransport } from '../../features/cart/cart-transport';
import { SiteHeaderClient } from './site-header';

const logoutAction = vi.fn();

const emptyCart: Cart = {
  currency: 'USD',
  distinctItemCount: 0,
  items: [],
  subtotalMinor: 0,
};

function SiteHeader({
  sessionState = { kind: 'anonymous' },
  transport = createTransport(emptyCart),
}: Readonly<{
  sessionState?: ComponentProps<typeof SiteHeaderClient>['sessionState'];
  transport?: CartTransport;
}>) {
  return (
    <CartProvider transport={transport}>
      <SiteHeaderClient
        logoutAction={logoutAction}
        sessionState={sessionState}
      />
    </CartProvider>
  );
}

let pathname = '/';
let mediaQueryListeners = new Set<(event: MediaQueryListEvent) => void>();

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

vi.mock('next/image', () => ({
  default: ({ alt, ...props }: ComponentProps<'img'>) => (
    // The production component remains next/image; this keeps interaction
    // tests focused on header semantics rather than image optimization.
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

function installMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      addEventListener: (
        type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        if (type === 'change') mediaQueryListeners.add(listener);
      },
      dispatchEvent: () => true,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: (
        type: string,
        listener: (event: MediaQueryListEvent) => void,
      ) => {
        if (type === 'change') mediaQueryListeners.delete(listener);
      },
    })),
  );
}

function enterWideViewport() {
  const event = { matches: true } as MediaQueryListEvent;
  mediaQueryListeners.forEach((listener) => listener(event));
}

describe('SiteHeader', () => {
  beforeEach(() => {
    pathname = '/';
    mediaQueryListeners = new Set();
    installMatchMedia();
  });

  it.each([
    ['/', 'Products'],
    ['/product/cascade-hops', 'Products'],
    ['/cart', 'Shopping cart'],
  ])('marks the confirmed navigation for %s', (route, currentLabel) => {
    pathname = route;
    render(<SiteHeader />);

    const navigation = screen.getByRole('navigation', {
      name: 'Storefront',
    });
    const products = screen.getByRole('link', { name: 'Products' });
    const cart = screen.getByRole('link', { name: /^Shopping cart/ });

    expect(navigation).toContainElement(products);
    expect(navigation).toContainElement(cart);
    const current = screen.getByRole('link', {
      name: currentLabel === 'Shopping cart' ? /^Shopping cart/ : currentLabel,
    });
    expect(current).toHaveAttribute('aria-current', 'page');
  });

  it('avoids redundant offset writes while the header remains stationary', () => {
    const hero = document.createElement('section');
    hero.dataset.catalogHero = '';
    document.body.append(hero);

    let heroBottom = 400;
    let nextAnimationFrame = 0;
    const animationFrames = new Map<number, FrameRequestCallback>();
    const rect = (top: number, bottom: number, height: number) =>
      ({
        bottom,
        height,
        left: 0,
        right: 100,
        toJSON: () => ({}),
        top,
        width: 100,
        x: 0,
        y: top,
      }) as DOMRect;
    const headerRect = rect(0, 72, 72);

    const boundingRectSpy = vi
      .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockImplementation(function (this: HTMLElement) {
        if (this.matches('.site-header')) return headerRect;
        if (this === hero) return rect(heroBottom - 288, heroBottom, 288);
        return rect(0, 0, 0);
      });
    const clientRectsSpy = vi
      .spyOn(hero, 'getClientRects')
      .mockImplementation(
        () =>
          [rect(heroBottom - 288, heroBottom, 288)] as unknown as DOMRectList,
      );
    vi.stubGlobal(
      'requestAnimationFrame',
      vi.fn((callback: FrameRequestCallback) => {
        const id = ++nextAnimationFrame;
        animationFrames.set(id, callback);
        return id;
      }),
    );
    vi.stubGlobal(
      'cancelAnimationFrame',
      vi.fn((id: number) => animationFrames.delete(id)),
    );
    const styleSpy = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty');

    const flushAnimationFrames = () => {
      const pendingFrames = Array.from(animationFrames.entries());
      animationFrames.clear();
      pendingFrames.forEach(([, callback]) => callback(performance.now()));
    };
    const offsetWrites = () =>
      styleSpy.mock.calls.filter(
        ([property]) => property === '--site-header-exit-offset',
      );

    const { unmount } = render(<SiteHeader />);

    try {
      act(flushAnimationFrames);
      expect(offsetWrites()).toEqual([['--site-header-exit-offset', '0px']]);

      act(() => {
        window.dispatchEvent(new Event('scroll'));
        flushAnimationFrames();
        window.dispatchEvent(new Event('scroll'));
        flushAnimationFrames();
      });
      expect(offsetWrites()).toHaveLength(1);

      heroBottom = 40;
      act(() => {
        window.dispatchEvent(new Event('scroll'));
        flushAnimationFrames();
        window.dispatchEvent(new Event('scroll'));
        flushAnimationFrames();
      });
      expect(offsetWrites()).toEqual([
        ['--site-header-exit-offset', '0px'],
        ['--site-header-exit-offset', '-32px'],
      ]);
    } finally {
      unmount();
      styleSpy.mockRestore();
      clientRectsSpy.mockRestore();
      boundingRectSpy.mockRestore();
      vi.unstubAllGlobals();
      hero.remove();
    }
  });

  it('exposes an inline disclosure and preserves native Tab order', async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const trigger = screen.getByRole('button', { name: 'Open menu' });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveAttribute('aria-controls', 'storefront-navigation');

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Close menu' })).toBe(trigger);

    await user.tab();
    expect(screen.getByRole('link', { name: 'Products' })).toHaveFocus();
  });

  it('closes on Escape and returns focus to the disclosure trigger', async () => {
    const user = userEvent.setup();
    render(<SiteHeader />);

    const trigger = screen.getByRole('button', { name: 'Open menu' });
    await user.click(trigger);
    await user.tab();
    await user.keyboard('{Escape}');

    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('closes after a link activation, pathname update or wide resize', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SiteHeader />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });

    await user.click(trigger);
    await user.click(screen.getByRole('link', { name: 'Products' }));
    expect(trigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(trigger);
    pathname = '/cart';
    rerender(<SiteHeader />);
    const currentTrigger = screen.getByRole('button', { name: 'Open menu' });
    expect(currentTrigger).toHaveAttribute('aria-expanded', 'false');

    await user.click(currentTrigger);
    act(() => enterWideViewport());
    expect(currentTrigger).toHaveAttribute('aria-expanded', 'false');
  });

  it('does not restore stale open state when history returns to a pathname', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SiteHeader />);
    const trigger = screen.getByRole('button', { name: 'Open menu' });

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');

    pathname = '/cart';
    rerender(<SiteHeader />);
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );

    pathname = '/';
    rerender(<SiteHeader />);
    expect(screen.getByRole('button', { name: 'Open menu' })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
  });

  it('shows only anonymous account actions without assuming a session', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.getByRole('link', { name: 'Register' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(
      screen.queryByRole('link', { name: 'Account' }),
    ).not.toBeInTheDocument();
  });

  it('shows account and logout but no admin navigation for a Nest-verified customer session', () => {
    render(
      <SiteHeader sessionState={{ isAdmin: false, kind: 'authenticated' }} />,
    );

    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
    expect(
      screen.queryByRole('link', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('link', { name: 'Product Management' }),
    ).not.toBeInTheDocument();
  });

  it('shows Product Management only for a Nest-verified admin session', () => {
    pathname = '/admin/products';
    render(
      <SiteHeader sessionState={{ isAdmin: true, kind: 'authenticated' }} />,
    );

    expect(
      screen.getByRole('link', { name: 'Product Management' }),
    ).toHaveAttribute('href', '/admin/products');
    expect(
      screen.getByRole('link', { name: 'Product Management' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('exposes authentication unavailability instead of rendering anonymous actions', () => {
    render(<SiteHeader sessionState={{ kind: 'unavailable' }} />);

    expect(screen.getByText('Account unavailable')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(
      screen.queryByRole('link', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('updates the cart count and its accessible name without reload', async () => {
    const user = userEvent.setup();
    const addedCart: Cart = {
      ...emptyCart,
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
    const transport = createTransport(emptyCart, {
      add: vi.fn(async () => addedCart),
    });
    render(
      <CartProvider transport={transport}>
        <SiteHeaderClient
          logoutAction={logoutAction}
          sessionState={{ kind: 'anonymous' }}
        />
        <CartAddProbe />
      </CartProvider>,
    );

    await expectCartName('Shopping cart, 0 items');
    await user.click(screen.getByRole('button', { name: 'Add fixture item' }));
    await expectCartName('Shopping cart, 1 item');
    expect(
      screen.getByRole('link', { name: /^Shopping cart/ }),
    ).toHaveAttribute('href', '/cart');
  });
});

function CartAddProbe() {
  const { add } = useCart();
  return (
    <button onClick={() => void add('citra-hops', 1)} type="button">
      Add fixture item
    </button>
  );
}

async function expectCartName(name: string) {
  await waitFor(() => expect(screen.getByRole('link', { name })).toBeVisible());
}

function createTransport(
  loadedCart: Cart,
  overrides: Partial<CartTransport> = {},
): CartTransport {
  return {
    add: vi.fn(async () => loadedCart),
    checkoutReadiness: vi.fn(async () => ({
      checkedAt: '2026-08-27T12:00:00.000Z',
      lines: [],
      status:
        loadedCart.items.length === 0 ? ('empty' as const) : ('ready' as const),
    })),
    clear: vi.fn(async () => loadedCart),
    load: vi.fn(async () => loadedCart),
    remove: vi.fn(async () => loadedCart),
    update: vi.fn(async () => loadedCart),
    ...overrides,
  };
}
