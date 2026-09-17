'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '../../components/ui/button';
import { createBrowserCheckoutPaymentTransport } from './checkout-payment-transport';

export const PAYMENT_HANDOFF_KEY = 'hb-checkout-payment-v1';
type Attempt = { draftId: string; key: string; attemptId?: string };
type State =
  | 'idle'
  | 'checking'
  | 'starting'
  | 'ready_for_redirect'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'unknown';

// No address, amount, credentials or hosted URL is persisted here. The server
// remains authoritative; this record only correlates an idempotent request.
function readAttempt(): Attempt | null {
  const raw = window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY);
  if (!raw) return null;
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object')
    throw new Error('Invalid payment handoff');
  const record = value as Record<string, unknown>;
  const uuid =
    /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;
  if (
    typeof record.draftId !== 'string' ||
    !uuid.test(record.draftId) ||
    typeof record.key !== 'string' ||
    !uuid.test(record.key) ||
    (record.attemptId !== undefined &&
      (typeof record.attemptId !== 'string' || !uuid.test(record.attemptId)))
  ) {
    throw new Error('Invalid payment handoff');
  }
  return record as Attempt;
}

export function CheckoutPayment({
  draftId,
  canPay,
  onAttemptUnsettledChange,
  onSucceededChange,
  successCheckClassName,
  successClassName,
  successHeadingId,
}: Readonly<{
  draftId: string | null;
  canPay: boolean;
  onAttemptUnsettledChange?: (unsettled: boolean) => void;
  onSucceededChange?: (succeeded: boolean) => void;
  successCheckClassName?: string;
  successClassName?: string;
  successHeadingId?: string;
}>) {
  const [state, setState] = useState<State>('checking');
  const [hasAttempt, setHasAttempt] = useState(false);
  const [paymentReturn, setPaymentReturn] = useState(false);
  const [returnTimedOut, setReturnTimedOut] = useState(false);
  const attempt = useRef<Attempt | null>(null);
  const operation = useRef(0);
  const busy = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    onAttemptUnsettledChange?.(
      state === 'checking' ||
        state === 'starting' ||
        state === 'ready_for_redirect' ||
        state === 'processing' ||
        state === 'unknown',
    );
  }, [onAttemptUnsettledChange, state]);

  useEffect(() => {
    onSucceededChange?.(state === 'succeeded');
  }, [onSucceededChange, state]);

  useEffect(() => {
    mounted.current = true;
    const generation = ++operation.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    // The initial status read happens immediately; ten three-second waits then
    // cover the complete 30-second return-confirmation window.
    let remainingPolls = 10;
    const returned =
      new URLSearchParams(window.location.search).get('payment') === 'return';
    const check = async () => {
      if (cancelled || generation !== operation.current) return;
      try {
        const saved = readAttempt();
        attempt.current = saved;
        setHasAttempt(saved !== null);
        if (!saved) {
          if (!cancelled)
            setState(
              new URLSearchParams(window.location.search).has('payment')
                ? 'unknown'
                : 'idle',
            );
          return;
        }
        const result = await createBrowserCheckoutPaymentTransport().status();
        if (cancelled || generation !== operation.current) return;
        if (
          !result ||
          !saved.attemptId ||
          result.attemptId !== saved.attemptId
        ) {
          setState('unknown');
          return;
        }
        if (returned) setPaymentReturn(true);
        setState(result.status);
        const pendingReturn =
          returned &&
          (result.status === 'processing' ||
            result.status === 'ready_for_redirect');
        if (
          (result.status === 'processing' || pendingReturn) &&
          remainingPolls-- > 0
        ) {
          timer = setTimeout(() => void check(), 3000);
        } else if (pendingReturn) {
          setReturnTimedOut(true);
        }
      } catch {
        if (!cancelled && generation === operation.current) setState('unknown');
      }
    };
    void check();
    return () => {
      cancelled = true;
      mounted.current = false;
      clearTimeout(timer);
    };
  }, []);

  const start = async () => {
    if (busy.current) return;
    busy.current = true;
    operation.current++;
    setState('starting');
    try {
      let saved = attempt.current;
      if (!saved) {
        if (!canPay || !draftId) throw new Error('Save checkout first');
        saved = { draftId, key: window.crypto.randomUUID() };
        window.sessionStorage.setItem(
          PAYMENT_HANDOFF_KEY,
          JSON.stringify(saved),
        );
        attempt.current = saved;
        setHasAttempt(true);
      }
      const result = await createBrowserCheckoutPaymentTransport().start(
        saved.draftId,
        saved.key,
      );
      if (saved.attemptId && saved.attemptId !== result.attemptId)
        throw new Error('Unexpected payment attempt');
      saved = { ...saved, attemptId: result.attemptId };
      window.sessionStorage.setItem(PAYMENT_HANDOFF_KEY, JSON.stringify(saved));
      attempt.current = saved;
      if (mounted.current) window.location.assign(result.checkoutUrl);
    } catch {
      if (mounted.current) setState('unknown');
    } finally {
      busy.current = false;
    }
  };

  const reconcile = async () => {
    if (busy.current) return;
    busy.current = true;
    operation.current++;
    setState('checking');
    try {
      const result = await createBrowserCheckoutPaymentTransport().reconcile();
      if (
        !attempt.current?.attemptId ||
        result.attemptId !== attempt.current.attemptId
      ) {
        throw new Error('Uncorrelated payment');
      }
      if (mounted.current) setState(result.status);
    } catch {
      if (mounted.current) setState('unknown');
    } finally {
      busy.current = false;
    }
  };

  if (state === 'succeeded')
    return (
      <div className={successClassName} role="status">
        <span aria-hidden className={successCheckClassName}>
          ✓
        </span>
        <h1 id={successHeadingId}>Payment successful</h1>
        <p>Your payment has been received. Thank you for your order.</p>
        <Button
          href="/"
          onClick={(event) => {
            try {
              window.sessionStorage.removeItem(PAYMENT_HANDOFF_KEY);
              if (window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY) !== null)
                throw new Error('Payment handoff could not be cleared');
            } catch {
              event.preventDefault();
              setState('unknown');
            }
          }}
        >
          Continue shopping
        </Button>
      </div>
    );

  if (state === 'idle')
    return (
      <Button disabled={!canPay || !draftId} onClick={() => void start()}>
        Pay with Stripe
      </Button>
    );

  const terminal = state === 'failed' || state === 'cancelled';
  const returnedPending = paymentReturn && state === 'ready_for_redirect';
  return (
    <div aria-live="polite">
      <p>
        {state === 'starting'
          ? 'Opening secure payment…'
          : state === 'checking'
            ? 'Checking payment status…'
            : state === 'processing'
              ? 'Your payment is being confirmed. Please do not start another payment.'
              : terminal
                ? 'This payment was not completed. Your cart has been kept.'
                : state === 'ready_for_redirect'
                  ? returnedPending && returnTimedOut
                    ? 'Your payment is still being confirmed. Check its status again before trying anything else.'
                    : returnedPending
                      ? 'Your payment is being confirmed. Please do not start another payment.'
                      : 'Your secure payment is ready to continue.'
                  : 'We cannot confirm the payment result yet. Check its status before trying again.'}
      </p>
      {state === 'starting' || state === 'checking' ? null : (
        <>
          {!terminal ? (
            <Button onClick={() => void reconcile()} variant="secondary">
              Check payment status
            </Button>
          ) : null}
          {!returnedPending &&
          (state === 'ready_for_redirect' || state === 'unknown') &&
          hasAttempt ? (
            <Button onClick={() => void start()}>
              Continue existing payment
            </Button>
          ) : null}
          {terminal ? (
            <Button
              disabled={!canPay || !draftId}
              onClick={() => {
                try {
                  window.sessionStorage.removeItem(PAYMENT_HANDOFF_KEY);
                  attempt.current = null;
                  setHasAttempt(false);
                  setState('idle');
                } catch {
                  setState('unknown');
                }
              }}
            >
              Review and try again
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}
