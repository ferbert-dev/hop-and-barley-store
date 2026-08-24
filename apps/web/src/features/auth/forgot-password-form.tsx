'use client';

import { type FormEvent, useEffect, useRef, useState } from 'react';

import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { validateRecoveryEmail } from './auth-validation';
import styles from './auth.module.css';

const NEUTRAL_RECOVERY_MESSAGE =
  'If this email is registered, you will receive a password-reset link.';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState(false);
  const statusRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (submitted) statusRef.current?.focus();
  }, [submitted]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = validateRecoveryEmail(email);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setEmail(result.value);
    setError(undefined);
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <section
        className={styles.feedback}
        ref={statusRef}
        role="status"
        tabIndex={-1}
      >
        <p>{NEUTRAL_RECOVERY_MESSAGE}</p>
      </section>
    );
  }

  return (
    <section className={styles.panel} aria-labelledby="forgot-password-heading">
      <h1 className="visually-hidden" id="forgot-password-heading">
        Forgot password
      </h1>
      <form className={styles.form} noValidate onSubmit={submit}>
        <Field
          autoComplete="email"
          error={error}
          id="forgot-password-email"
          inputMode="email"
          label="Email"
          maxLength={320}
          name="email"
          onChange={(event) => {
            setEmail(event.currentTarget.value);
            if (error) setError(undefined);
          }}
          required
          type="email"
          value={email}
        />
        <div className={styles.formActions}>
          <Button href="/login" variant="secondary">
            Cancel
          </Button>
          <Button type="submit">Reset Password</Button>
        </div>
      </form>
    </section>
  );
}
