import Image from 'next/image';
import Link from 'next/link';

import { assets } from '../../design-system/assets';

export function SiteFooter() {
  return (
    <footer className="site-footer" aria-labelledby="store-information-title">
      <div className="site-footer__content">
        <h2 id="store-information-title" className="visually-hidden">
          Store information
        </h2>
        <Image
          className="site-footer__artwork"
          src={assets.footerHops.src}
          alt={assets.footerHops.alt}
          width={assets.footerHops.width}
          height={assets.footerHops.height}
          sizes={assets.footerHops.sizes}
        />
        <nav className="site-footer__nav" aria-label="Footer">
          <ul>
            <li>
              <Link href="/">Products</Link>
            </li>
            <li>
              <Link href="/cart" prefetch={false}>
                Shopping cart
              </Link>
            </li>
          </ul>
        </nav>
        <p>© Hop &amp; Barley. All rights reserved.</p>
      </div>
    </footer>
  );
}
