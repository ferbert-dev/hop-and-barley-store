import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { Button } from '../../components/ui/button';
import { readCurrentSession } from '../../features/auth/read-current-session';
import styles from '../../features/auth/auth.module.css';

export const metadata: Metadata = { title: 'Account' };
export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const current = await readCurrentSession();
  if (current.kind === 'anonymous') redirect('/login?next=%2Faccount');

  if (current.kind === 'unavailable') {
    return (
      <div className={styles.screen}>
        <section
          className={styles.protectedPanel}
          aria-labelledby="account-error"
        >
          <h1 id="account-error">Account unavailable</h1>
          <p role="alert">
            We could not verify your secure session. Please try again.
          </p>
          <Button href="/account">Try again</Button>
        </section>
      </div>
    );
  }

  return (
    <div className={styles.screen}>
      <section
        className={styles.protectedPanel}
        aria-labelledby="account-heading"
      >
        <p className={styles.eyebrow}>Verified session</p>
        <h1 id="account-heading">Your account</h1>
        <p>You are signed in securely.</p>
      </section>
    </div>
  );
}
