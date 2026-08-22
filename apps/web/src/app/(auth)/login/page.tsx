import type { Metadata } from 'next';

import { loginAction } from '../../../features/auth/auth-actions';
import { AuthForm } from '../../../features/auth/auth-form';
import styles from '../../../features/auth/auth.module.css';
import { safeReturnPath } from '../../../features/auth/auth-validation';

export const metadata: Metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

type LoginPageProps = Readonly<{
  searchParams: Promise<{ next?: string; status?: string }>;
}>;

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const query = await searchParams;
  const action = loginAction.bind(null, safeReturnPath(query.next));

  return (
    <div className={styles.screen}>
      <AuthForm
        action={action}
        kind="login"
        signedOut={query.status === 'signed-out'}
      />
    </div>
  );
}
