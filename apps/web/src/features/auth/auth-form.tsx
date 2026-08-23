'use client';

import Link from 'next/link';
import {
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  evaluatePasswordRequirements,
  PASSWORD_REQUIREMENTS,
} from '@hop-and-barley/auth-contract';

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
    pendingLabel: 'Registering…',
    submitLabel: 'Register',
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
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const confirmationMismatch =
    kind === 'register' &&
    confirmPassword.length > 0 &&
    password !== confirmPassword
      ? 'Passwords do not match.'
      : undefined;

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
            label={kind === 'register' ? 'Email' : 'Email address'}
            maxLength={320}
            name="email"
            required
            type="email"
          />
          <Field
            autoComplete={copy.passwordAutocomplete}
            description={
              kind === 'register' ? (
                <PasswordRequirements password={password} />
              ) : undefined
            }
            error={state.errors?.password}
            id={`${kind}-password`}
            label="Password"
            name="password"
            {...(kind === 'register'
              ? {
                  onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                    setPassword(event.currentTarget.value),
                  value: password,
                }
              : {})}
            required
            type="password"
          />
          {kind === 'register' ? (
            <Field
              aria-invalid={Boolean(confirmationMismatch) || undefined}
              autoComplete="new-password"
              error={state.errors?.confirmPassword ?? confirmationMismatch}
              id="register-confirm-password"
              label="Confirm Password"
              name="confirmPassword"
              onChange={(event) =>
                setConfirmPassword(event.currentTarget.value)
              }
              required
              type="password"
              value={confirmPassword}
            />
          ) : null}
          <Button
            pending={pending}
            pendingLabel={copy.pendingLabel}
            type="submit"
          >
            {copy.submitLabel}
          </Button>
          <div className={styles.separator} aria-hidden="true">
            <span>Or</span>
          </div>
          <Button
            aria-describedby={`${kind}-google-note`}
            disabled
            type="button"
            variant="secondary"
          >
            Continue with Google
          </Button>
          <p className={styles.googleNote} id={`${kind}-google-note`}>
            Google sign-in is not available in this MVP.
          </p>
        </fieldset>
      </form>

      <p className={styles.alternate}>
        {copy.alternatePrompt}{' '}
        <Link href={copy.alternateHref}>{copy.alternateLabel}</Link>
      </p>
    </section>
  );
}

function PasswordRequirements({ password }: Readonly<{ password: string }>) {
  const state = evaluatePasswordRequirements(password);

  return (
    <span className={styles.passwordRequirements}>
      <span>Password must include:</span>
      <span aria-live="polite" className={styles.requirementList} role="list">
        {PASSWORD_REQUIREMENTS.map((requirement) => (
          <span
            className={
              state[requirement.key]
                ? styles.requirementMet
                : styles.requirementPending
            }
            key={requirement.key}
            role="listitem"
          >
            <span aria-hidden="true">{state[requirement.key] ? '✓' : '○'}</span>{' '}
            {requirement.label}
            <span className="visually-hidden">
              {state[requirement.key] ? ' — met' : ' — not met'}
            </span>
          </span>
        ))}
      </span>
    </span>
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
