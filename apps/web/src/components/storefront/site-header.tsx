'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';

import { assets } from '../../design-system/assets';
import type { AuthFormAction } from '../../features/auth/auth-form';
import { INITIAL_AUTH_FORM_STATE } from '../../features/auth/auth-state';
import { useCart } from '../../features/cart/cart-context';
import { Button } from '../ui/button';

const DESKTOP_NAVIGATION_QUERY = '(min-width: 80rem)';

function isProductsPath(pathname: string) {
  return pathname === '/' || pathname.startsWith('/product/');
}

export type HeaderSessionState =
  | Readonly<{ kind: 'anonymous' | 'loading' | 'unavailable' }>
  | Readonly<{ isAdmin: boolean; kind: 'authenticated' }>;

type SiteHeaderClientProps = Readonly<{
  logoutAction: AuthFormAction;
  sessionState: HeaderSessionState;
}>;

export function SiteHeaderClient(props: SiteHeaderClientProps) {
  const pathname = usePathname();

  return <SiteHeaderDisclosure key={pathname} pathname={pathname} {...props} />;
}

type SiteHeaderDisclosureProps = Readonly<{
  logoutAction: AuthFormAction;
  pathname: string;
  sessionState: HeaderSessionState;
}>;

function SiteHeaderDisclosure({
  logoutAction,
  pathname,
  sessionState,
}: SiteHeaderDisclosureProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { ensureLoaded, items, state: cartState } = useCart();
  const headerRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const cartLineCount = items.length;

  useEffect(() => {
    void ensureLoaded();
  }, [ensureLoaded]);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const wideViewport = window.matchMedia(DESKTOP_NAVIGATION_QUERY);
    const closeAtWideViewport = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };

    wideViewport.addEventListener('change', closeAtWideViewport);
    return () => {
      wideViewport.removeEventListener('change', closeAtWideViewport);
    };
  }, []);

  useEffect(() => {
    if (pathname !== '/') return;

    const header = headerRef.current;
    if (!header) return;

    let animationFrame = 0;
    let appliedOffset: number | null = null;
    const observedHeroes = new Set<HTMLElement>();
    const intersectionObserver =
      typeof IntersectionObserver === 'undefined'
        ? null
        : new IntersectionObserver(() => {
            scheduleHeaderOffset();
          });
    const resizeObserver =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(() => {
            scheduleHeaderOffset();
          });

    const applyHeaderOffset = (offset: number) => {
      const pixelRatio = window.devicePixelRatio || 1;
      const devicePixelOffset = Math.round(offset * pixelRatio) / pixelRatio;
      const nextOffset = `${String(devicePixelOffset)}px`;

      if (
        appliedOffset === devicePixelOffset &&
        header.style.getPropertyValue('--site-header-exit-offset') ===
          nextOffset
      ) {
        return;
      }

      appliedOffset = devicePixelOffset;
      header.style.setProperty('--site-header-exit-offset', nextOffset);
    };

    const updateHeaderOffset = () => {
      animationFrame = 0;

      const heroes = document.querySelectorAll<HTMLElement>(
        '[data-catalog-hero]',
      );
      const hero = Array.from(heroes)
        .reverse()
        .find((candidate) => candidate.getClientRects().length > 0);
      if (!hero) {
        applyHeaderOffset(0);
        return;
      }

      const headerHeight = header.getBoundingClientRect().height;
      const heroBottom = hero.getBoundingClientRect().bottom;
      const offset = Math.max(
        -headerHeight,
        Math.min(0, heroBottom - headerHeight),
      );

      applyHeaderOffset(offset);
    };

    function scheduleHeaderOffset() {
      if (animationFrame) return;
      animationFrame = window.requestAnimationFrame(updateHeaderOffset);
    }

    const observeCatalogHeroes = () => {
      const heroes = document.querySelectorAll<HTMLElement>(
        '[data-catalog-hero]',
      );

      for (const hero of heroes) {
        if (observedHeroes.has(hero)) continue;
        observedHeroes.add(hero);
        intersectionObserver?.observe(hero);
        resizeObserver?.observe(hero);
      }

      scheduleHeaderOffset();
    };

    const restoreHeaderOffset = () => {
      scheduleHeaderOffset();
    };

    const restoreVisibleHeaderOffset = () => {
      if (document.visibilityState === 'visible') scheduleHeaderOffset();
    };

    const mutationObserver =
      typeof MutationObserver === 'undefined'
        ? null
        : new MutationObserver(observeCatalogHeroes);

    applyHeaderOffset(0);
    updateHeaderOffset();
    observeCatalogHeroes();
    resizeObserver?.observe(header);
    mutationObserver?.observe(
      document.querySelector('#main-content') ?? document.body,
      { childList: true, subtree: true },
    );
    window.addEventListener('focus', restoreHeaderOffset);
    window.addEventListener('pageshow', restoreHeaderOffset);
    window.addEventListener('resize', scheduleHeaderOffset);
    window.addEventListener('scroll', scheduleHeaderOffset, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleHeaderOffset);
    document.addEventListener('visibilitychange', restoreVisibleHeaderOffset);

    return () => {
      intersectionObserver?.disconnect();
      mutationObserver?.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener('focus', restoreHeaderOffset);
      window.removeEventListener('pageshow', restoreHeaderOffset);
      window.removeEventListener('resize', scheduleHeaderOffset);
      window.removeEventListener('scroll', scheduleHeaderOffset);
      window.visualViewport?.removeEventListener(
        'resize',
        scheduleHeaderOffset,
      );
      document.removeEventListener(
        'visibilitychange',
        restoreVisibleHeaderOffset,
      );
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      header.style.removeProperty('--site-header-exit-offset');
    };
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      event.preventDefault();
      setMenuOpen(false);
      triggerRef.current?.focus();
    };

    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <header
      ref={headerRef}
      className="site-header"
      aria-label="Hop and Barley storefront"
      data-scroll-mode={pathname === '/' ? 'hero-bound' : 'persistent'}
    >
      <div className="site-header__inner">
        <Link className="brand" href="/" aria-label="Hop and Barley home">
          <Image
            className="brand__mark"
            src={assets.brandMark.src}
            alt={assets.brandMark.alt}
            width={assets.brandMark.width}
            height={assets.brandMark.height}
            sizes={assets.brandMark.sizes}
          />
          <span>Hop &amp; Barley</span>
        </Link>

        <button
          ref={triggerRef}
          className="menu-trigger"
          type="button"
          aria-controls="storefront-navigation"
          aria-expanded={menuOpen}
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span aria-hidden="true" className="menu-trigger__icon">
            <span />
            <span />
            <span />
          </span>
        </button>

        <nav
          id="storefront-navigation"
          className="storefront-nav"
          aria-label="Storefront"
          data-open={menuOpen}
        >
          <ul>
            <li>
              <Link
                href="/"
                aria-current={isProductsPath(pathname) ? 'page' : undefined}
                onClick={closeMenu}
              >
                Products
              </Link>
            </li>
            <li>
              <Link
                className="storefront-nav__cart"
                href="/cart"
                prefetch={false}
                aria-label={
                  cartState.kind === 'ready'
                    ? `Shopping cart, ${String(cartLineCount)} ${
                        cartLineCount === 1 ? 'item' : 'items'
                      }`
                    : 'Shopping cart'
                }
                aria-current={pathname === '/cart' ? 'page' : undefined}
                onClick={closeMenu}
              >
                <Image
                  src={assets.cartIcon.src}
                  alt={assets.cartIcon.alt}
                  width={assets.cartIcon.width}
                  height={assets.cartIcon.height}
                  sizes={assets.cartIcon.sizes}
                />
                <span>Shopping cart</span>
                {cartState.kind === 'ready' ? (
                  <span
                    aria-hidden="true"
                    className="storefront-nav__cart-count"
                  >
                    {cartLineCount}
                  </span>
                ) : null}
              </Link>
            </li>
            {sessionState.kind === 'authenticated' ? (
              <>
                {sessionState.isAdmin ? (
                  <li>
                    <Link
                      href="/admin/products"
                      aria-current={
                        pathname.startsWith('/admin/') ? 'page' : undefined
                      }
                      onClick={closeMenu}
                    >
                      Product Management
                    </Link>
                  </li>
                ) : null}
                <li>
                  <Link
                    href="/account"
                    aria-current={pathname === '/account' ? 'page' : undefined}
                    onClick={closeMenu}
                  >
                    Account
                  </Link>
                </li>
                <li>
                  <LogoutForm action={logoutAction} />
                </li>
              </>
            ) : sessionState.kind === 'anonymous' ? (
              <>
                <li>
                  <Link href="/login" onClick={closeMenu}>
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link href="/register" onClick={closeMenu}>
                    Register
                  </Link>
                </li>
              </>
            ) : (
              <li>
                <span aria-live="polite" className="storefront-nav__session">
                  {sessionState.kind === 'loading'
                    ? 'Checking account…'
                    : 'Account unavailable'}
                </span>
              </li>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}

function LogoutForm({ action }: Readonly<{ action: AuthFormAction }>) {
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_AUTH_FORM_STATE,
  );

  return (
    <form action={formAction} className="storefront-nav__logout">
      <Button
        pending={pending}
        pendingLabel="Signing out…"
        type="submit"
        variant="secondary"
      >
        Sign out
      </Button>
      {state.status === 'unavailable' ? (
        <span role="alert">Sign out is temporarily unavailable.</span>
      ) : null}
    </form>
  );
}
