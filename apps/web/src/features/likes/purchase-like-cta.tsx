'use client';

import { Heart } from '@phosphor-icons/react/dist/ssr';
import { useState } from 'react';

import { Button } from '../../components/ui/button';
import { useLikes } from './likes-context';
import styles from './likes.module.css';

export function PurchaseLikeCta({
  paymentAttemptId,
}: Readonly<{
  paymentAttemptId: string;
}>) {
  const { createLike } = useLikes();
  const [state, setState] = useState<'idle' | 'pending' | 'sent' | 'error'>(
    'idle',
  );

  const submit = async () => {
    setState('pending');
    try {
      await createLike(paymentAttemptId);
      setState('sent');
    } catch {
      setState('error');
    }
  };

  if (state === 'sent') {
    return (
      <p className={styles.ctaStatus} role="status">
        <Heart aria-hidden size={20} weight="fill" /> Like sent — thank you.
      </p>
    );
  }

  return (
    <div className={styles.cta}>
      <Button
        aria-describedby={state === 'error' ? 'purchase-like-error' : undefined}
        onClick={() => void submit()}
        pending={state === 'pending'}
        pendingLabel="Sending your like…"
      >
        <Heart aria-hidden size={20} weight="fill" />
        {state === 'error' ? 'Try leaving your like again' : 'Like this shop'}
      </Button>
      {state === 'error' ? (
        <p className={styles.ctaError} id="purchase-like-error" role="alert">
          We couldn’t send your like. Please try again.
        </p>
      ) : null}
    </div>
  );
}
