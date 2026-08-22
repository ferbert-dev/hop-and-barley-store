'use client';

import Link from 'next/link';
import { useActionState, useCallback, useEffect, useRef } from 'react';

import { Button } from '../../components/ui/button';
import { Field } from '../../components/ui/field';
import { loginFromBrowser, registerFromBrowser } from './auth-browser-actions';
import { INITIAL_AUTH_FORM_STATE, type AuthFormState } from './auth-state';
import styles from './auth.module.css';

export type AuthFormAction = (
  previousState: AuthFormState,
  formData: FormData,
) => Promise<AuthFormState>;

type AuthFormProps = Readonly<{
  action?: AuthFormAction;
  kind: 'login' | 'register';
  returnTo?: string;
  signedOut?: boolean;
}>;

const formCopy = {
  login: {
    alternateHref: '/register',
    alternateLabel: 'Create an account',
    alternatePrompt: 'New to Hop & Barley?',
    heading: 'Sign in to your account',
    intro: 'Use your email and password to continue securely.',
    passwordAutocomplete: 'current-password',
    pendingLabel: 'Signing in…',
    submitLabel: 'Sign in',
  },
  register: {
    alternateHref: '/login',
    alternateLabel: 'Sign in instead',
    alternatePrompt: 'Already registered?',
    heading: 'Create your account',
    intro: 'Create a local password account. No social provider is required.',
    passwordAutocomplete: 'new-password',
    pendingLabel: 'Creating account…',
    submitLabel: 'Create account',
  },
} as const;

export function AuthForm({
  action: suppliedAction,
  kind,
  returnTo = '/',
  signedOut = false,
}: AuthFormProps) {
  const loginAction = useCallback(
    (state: AuthFormState, formData: FormData) =>
      loginFromBrowser(returnTo, state, formData),
    [returnTo],
  );
  const action =
    suppliedAction ?? (kind === 'login' ? loginAction : registerFromBrowser);
  const [state, formAction, pending] = useActionState(
    action,
    INITIAL_AUTH_FORM_STATE,
  );
  const feedbackRef = useRef<HTMLDivElement>(null);
  const copy = formCopy[kind];

  useEffect(() => {
    if (state.status !== 'idle') feedbackRef.current?.focus();
  }, [state]);

  if (state.status === 'accepted') {
    return (
      <section
        className={styles.feedback}
        ref={feedbackRef}
        role="status"
        tabIndex={-1}
      >
        <h1>Check complete</h1>
        <p>If the details can be accepted, your account is ready.</p>
        <p>No account-existence details are disclosed here.</p>
        <Button href="/login">Continue to sign in</Button>
      </section>
    );
  }

  const genericMessage = getGenericMessage(kind, state);

  return (
    <section className={styles.panel} aria-labelledby={`${kind}-heading`}>
      <p className={styles.eyebrow}>Secure account access</p>
      <h1 id={`${kind}-heading`}>{copy.heading}</h1>
      <p className={styles.intro}>{copy.intro}</p>

      {signedOut && state.status === 'idle' ? (
        <div className={styles.notice} role="status">
          You have been signed out.
        </div>
      ) : null}

      {genericMessage ? (
        <div
          className={styles.errorSummary}
          ref={feedbackRef}
          role="alert"
          tabIndex={-1}
        >
          {genericMessage}
        </div>
      ) : null}

      <form action={formAction} className={styles.form}>
        <fieldset className={styles.fieldset} disabled={pending}>
          <legend className="visually-hidden">{copy.heading}</legend>
          <Field
            autoComplete="email"
            error={state.errors?.email}
            id={`${kind}-email`}
            inputMode="email"
            label="Email address"
            maxLength={320}
            name="email"
            required
            type="email"
          />
          <Field
            autoComplete={copy.passwordAutocomplete}
            description={
              kind === 'register'
                ? '15–128 characters. Use a unique passphrase.'
                : undefined
            }
            error={state.errors?.password}
            id={`${kind}-password`}
            label="Password"
            maxLength={128}
            name="password"
            required
            type="password"
          />
          <Button
            pending={pending}
            pendingLabel={copy.pendingLabel}
            type="submit"
          >
            {copy.submitLabel}
          </Button>
        </fieldset>
      </form>

      <p className={styles.alternate}>
        {copy.alternatePrompt}{' '}
        <Link href={copy.alternateHref}>{copy.alternateLabel}</Link>
      </p>
    </section>
  );
}

function getGenericMessage(
  kind: AuthFormProps['kind'],
  state: AuthFormState,
): string | null {
  if (state.status === 'unavailable') {
    return 'Authentication is temporarily unavailable. Please try again.';
  }
  if (state.status !== 'invalid' || state.errors) return null;
  return kind === 'login'
    ? 'The email or password was not recognised.'
    : 'Check the form fields and try again.';
}
