import Image from 'next/image';
import Link from 'next/link';
import { Package, ShieldCheck } from '@phosphor-icons/react/dist/ssr';
import type { ReactNode } from 'react';

import { assets } from '../../design-system/assets';
import styles from './admin-shell.module.css';

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className={`admin-workspace ${styles.workspace}`}>
      <aside className={styles.sidebar} aria-label="Admin navigation">
        <Link
          className={styles.brand}
          href="/"
          aria-label="Hop and Barley home"
        >
          <Image
            alt={assets.brandMark.alt}
            height={assets.brandMark.height}
            src={assets.brandMark.src}
            width={assets.brandMark.width}
          />
          <span>Hop &amp; Barley</span>
        </Link>
        <nav aria-label="Admin sections">
          <Link
            aria-current="page"
            className={styles.navItem}
            href="/admin/products"
          >
            <Package aria-hidden="true" size={20} weight="fill" />
            Products
          </Link>
        </nav>
        <div className={styles.adminIdentity}>
          <span className={styles.avatar}>A</span>
          <span>
            <strong>Administrator</strong>
            <small>Admin</small>
          </span>
          <ShieldCheck aria-hidden="true" size={20} />
        </div>
      </aside>
      <section className={styles.content}>{children}</section>
    </div>
  );
}
