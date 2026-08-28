import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { Button } from '../../components/ui/button';
import { AccountProfileForm } from '../../features/account/account-profile-form';
import accountStyles from '../../features/account/account-profile.module.css';
import { readCurrentUserProfile } from '../../features/account/profile-server';
import { selectSessionCookieHeader } from '../../features/auth/auth-cookie';
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

  const cookieStore = await cookies();
  const sessionCookie = selectSessionCookieHeader(cookieStore.getAll());
  const profileResult = await readCurrentUserProfile(sessionCookie);
  if (profileResult.kind === 'anonymous') redirect('/login?next=%2Faccount');

  if (profileResult.kind === 'unavailable') {
    return (
      <div className={styles.screen}>
        <section
          className={styles.protectedPanel}
          aria-labelledby="account-error"
        >
          <h1 id="account-error">Account unavailable</h1>
          <p role="alert">
            We could not load your private account information. Please try
            again.
          </p>
          <Button href="/account">Try again</Button>
        </section>
      </div>
    );
  }

  return (
    <section aria-labelledby="account-heading" className={styles.screen}>
      <div className={`${styles.protectedPanel} ${accountStyles.pagePanel}`}>
        <p className={styles.eyebrow}>Your account</p>
        <h1 id="account-heading">Account Information</h1>
        <AccountProfileForm initialProfile={profileResult.profile} />
      </div>
    </section>
  );
}
