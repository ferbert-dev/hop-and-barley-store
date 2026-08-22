'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useActionState, useEffect, useRef, useState } from 'react';

import { assets } from '../../design-system/assets';
import type { AuthFormAction } from '../../features/auth/auth-form';
import { INITIAL_AUTH_FORM_STATE } from '../../features/auth/auth-state';
import { Button } from '../ui/button';

const WIDE_VIEWPORT_QUERY = '(min-width: 64rem)';

function isProductsPath(pathname: string) {
  return pathname === '/' || pathname.startsWith('/product/');
}

export type HeaderSessionState =
  | Readonly<{ kind: 'anonymous' | 'loading' | 'unavailable' }>
  | Readonly<{ kind: 'authenticated' }>;

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
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;

    const wideViewport = window.matchMedia(WIDE_VIEWPORT_QUERY);
    const closeAtWideViewport = (event: MediaQueryListEvent) => {
      if (event.matches) setMenuOpen(false);
    };

    wideViewport.addEventListener('change', closeAtWideViewport);
    return () => {
      wideViewport.removeEventListener('change', closeAtWideViewport);
    };
  }, []);

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
    <header className="site-header" aria-label="Hop and Barley storefront">
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
              </Link>
            </li>
            {sessionState.kind === 'authenticated' ? (
              <>
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
