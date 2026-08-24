import type { Metadata } from 'next';

import { ForgotPasswordForm } from '../../../features/auth/forgot-password-form';
import styles from '../../../features/auth/auth.module.css';

export const metadata: Metadata = { title: 'Forgot password' };

export default function ForgotPasswordPage() {
  return (
    <div className={styles.screen}>
      <ForgotPasswordForm />
    </div>
  );
}
