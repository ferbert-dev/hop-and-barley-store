import type { ReactNode } from 'react';

import styles from './admin-shell.module.css';

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.screen}>
      <section className={styles.shell} aria-labelledby="admin-heading">
        <h1 id="admin-heading">Admin - Product Stock</h1>

        <nav aria-label="Admin sections" className={styles.tabs}>
          <span aria-current="page" className={styles.tabActive}>
            Product Management
          </span>
          <span aria-disabled="true" className={styles.tab}>
            Dashboard
          </span>
        </nav>

        {children}
      </section>
    </div>
  );
}
