import type { Metadata } from 'next';

import { AuthForm } from '../../../features/auth/auth-form';
import styles from '../../../features/auth/auth.module.css';
import { safeReturnPath } from '../../../features/auth/auth-validation';

export const metadata: Metadata = { title: 'Create account' };
export const dynamic = 'force-dynamic';

type RegisterPageProps = Readonly<{
  searchParams: Promise<{ next?: string }>;
}>;

export default async function RegisterPage({
  searchParams,
}: RegisterPageProps) {
  const query = await searchParams;
  return (
    <div className={styles.screen}>
      <AuthForm kind="register" returnTo={safeReturnPath(query.next)} />
    </div>
  );
}
