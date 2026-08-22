import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteHeaderClient } from './site-header';

const logoutAction = vi.fn();

function SiteHeader() {
  return (
    <SiteHeaderClient
      logoutAction={logoutAction}
      sessionState={{ kind: 'anonymous' }}
    />
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
    const cart = screen.getByRole('link', { name: 'Shopping cart' });

    expect(navigation).toContainElement(products);
    expect(navigation).toContainElement(cart);
    expect(screen.getByRole('link', { name: currentLabel })).toHaveAttribute(
      'aria-current',
      'page',
    );
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

  it('shows account and logout only for a Nest-verified session', () => {
    render(
      <SiteHeaderClient
        logoutAction={logoutAction}
        sessionState={{ kind: 'authenticated' }}
      />,
    );

    expect(screen.getByRole('link', { name: 'Account' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeEnabled();
    expect(
      screen.queryByRole('link', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });

  it('exposes authentication unavailability instead of rendering anonymous actions', () => {
    render(
      <SiteHeaderClient
        logoutAction={logoutAction}
        sessionState={{ kind: 'unavailable' }}
      />,
    );

    expect(screen.getByText('Account unavailable')).toHaveAttribute(
      'aria-live',
      'polite',
    );
    expect(
      screen.queryByRole('link', { name: 'Sign in' }),
    ).not.toBeInTheDocument();
  });
});
