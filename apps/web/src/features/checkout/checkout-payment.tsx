'use client';

import { useEffect, useRef, useState } from 'react';

import { Button } from '../../components/ui/button';
import { PurchaseLikeCta } from '../likes/purchase-like-cta';
import {
  CheckoutPaymentTransportError,
  createBrowserCheckoutPaymentTransport,
} from './checkout-payment-transport';

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
  | 'unavailable'
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
  const [hasConfirmedAttempt, setHasConfirmedAttempt] = useState(false);
  const [paymentReturn, setPaymentReturn] = useState(false);
  const [returnTimedOut, setReturnTimedOut] = useState(false);
  const [succeededAttemptId, setSucceededAttemptId] = useState<string | null>(
    null,
  );
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
        setHasConfirmedAttempt(saved?.attemptId !== undefined);
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
        if (result.status === 'succeeded')
          setSucceededAttemptId(saved.attemptId);
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
    let saved = attempt.current;
    let createdNewHandoff = false;
    try {
      if (!saved) {
        if (!canPay || !draftId) throw new Error('Save checkout first');
        saved = { draftId, key: window.crypto.randomUUID() };
        window.sessionStorage.setItem(
          PAYMENT_HANDOFF_KEY,
          JSON.stringify(saved),
        );
        attempt.current = saved;
        createdNewHandoff = true;
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
      setHasConfirmedAttempt(true);
      if (mounted.current) window.location.assign(result.checkoutUrl);
    } catch (error) {
      if (
        createdNewHandoff &&
        saved &&
        !saved.attemptId &&
        error instanceof CheckoutPaymentTransportError &&
        error.failure === 'payments_disabled'
      ) {
        try {
          const persisted = readAttempt();
          if (
            !persisted ||
            persisted.attemptId ||
            persisted.draftId !== saved.draftId ||
            persisted.key !== saved.key
          ) {
            throw new Error('Payment handoff changed');
          }
          window.sessionStorage.removeItem(PAYMENT_HANDOFF_KEY);
          if (window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY) !== null) {
            throw new Error('Payment handoff could not be cleared');
          }
          attempt.current = null;
          if (mounted.current) {
            setHasAttempt(false);
            setHasConfirmedAttempt(false);
            setState('unavailable');
          }
        } catch {
          if (mounted.current) setState('unknown');
        }
      } else if (mounted.current) {
        setState('unknown');
      }
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
      if (mounted.current && result.status === 'succeeded') {
        setSucceededAttemptId(attempt.current.attemptId);
      }
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
        <p>
          Thanks for your test purchase. If you like our shop, leave a like for
          the community.
        </p>
        {succeededAttemptId ? (
          <PurchaseLikeCta paymentAttemptId={succeededAttemptId} />
        ) : null}
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
  const unavailable = state === 'unavailable';
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
              : unavailable
                ? 'Test payment is currently unavailable. Your cart and checkout details are safe.'
                : terminal
                  ? 'This payment was not completed. Your cart has been kept.'
                  : state === 'ready_for_redirect'
                    ? returnedPending && returnTimedOut
                      ? 'Your payment is still being confirmed. Check its status again before trying anything else.'
                      : returnedPending
                        ? 'Your payment is being confirmed. Please do not start another payment.'
                        : 'Your secure payment is ready to continue.'
                    : state === 'unknown' && hasAttempt && !hasConfirmedAttempt
                      ? 'We could not confirm whether payment setup finished. Retry the same payment setup before starting a different payment.'
                      : 'We cannot confirm the payment result yet. Check its status before trying again.'}
      </p>
      {state === 'starting' || state === 'checking' ? null : (
        <>
          {!terminal && !unavailable ? (
            <Button onClick={() => void reconcile()} variant="secondary">
              Check payment status
            </Button>
          ) : null}
          {!returnedPending &&
          (state === 'ready_for_redirect' || state === 'unknown') &&
          hasAttempt ? (
            <Button onClick={() => void start()}>
              {hasConfirmedAttempt
                ? 'Continue existing payment'
                : 'Retry payment setup'}
            </Button>
          ) : null}
          {unavailable ? (
            <Button disabled={!canPay || !draftId} onClick={() => void start()}>
              Try payment again
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
                  setHasConfirmedAttempt(false);
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
