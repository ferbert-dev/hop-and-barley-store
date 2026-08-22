import type { Metadata } from 'next';

import { registerAction } from '../../../features/auth/auth-actions';
import { AuthForm } from '../../../features/auth/auth-form';
import styles from '../../../features/auth/auth.module.css';

export const metadata: Metadata = { title: 'Create account' };
export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  return (
    <div className={styles.screen}>
      <AuthForm action={registerAction} kind="register" />
    </div>
  );
}
