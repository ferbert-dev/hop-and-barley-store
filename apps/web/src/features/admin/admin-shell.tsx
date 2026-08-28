import styles from './admin-shell.module.css';

export function AdminShell() {
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

        <section
          className={styles.notice}
          aria-labelledby="availability-heading"
        >
          <h2 id="availability-heading">Product Management</h2>
          <p>Product management is not available yet.</p>
        </section>
      </section>
    </div>
  );
}
