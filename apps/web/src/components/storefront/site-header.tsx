'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

import { assets } from '../../design-system/assets';

const WIDE_VIEWPORT_QUERY = '(min-width: 64rem)';

function isProductsPath(pathname: string) {
  return pathname === '/' || pathname.startsWith('/product/');
}

export function SiteHeader() {
  const pathname = usePathname();

  return <SiteHeaderDisclosure key={pathname} pathname={pathname} />;
}

type SiteHeaderDisclosureProps = Readonly<{
  pathname: string;
}>;

function SiteHeaderDisclosure({ pathname }: SiteHeaderDisclosureProps) {
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
          </ul>
        </nav>
      </div>
    </header>
  );
}
