'use client';

import { useEffect, useState } from 'react';
import { resolveBrowserApiUrl } from '../../lib/browser-api-url';
import { Button } from '../../components/ui/button';
import styles from './auth.module.css';

const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PUBLIC_API_HOST_ALIASES = process.env.NEXT_PUBLIC_API_HOST_ALIASES ?? '';

export function CartMergeNotice() {
  const [visible, setVisible] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const revealStoredWarning = () => {
      setVisible(
        window.sessionStorage.getItem('hb-cart-merge-warning') === '1',
      );
    };

    queueMicrotask(revealStoredWarning);
  }, []);

  if (!visible) return null;

  async function retry() {
    setPending(true);
    try {
      const base = resolveBrowserApiUrl(
        PUBLIC_API_URL,
        window.location.origin,
        PUBLIC_API_HOST_ALIASES,
      );
      const csrfResponse = await fetch(`${base}/api/v1/auth/csrf`, {
        cache: 'no-store',
        credentials: 'include',
      });
      const csrf = (await csrfResponse.json()) as { csrfToken?: unknown };
      if (!csrfResponse.ok || typeof csrf.csrfToken !== 'string') return;
      const response = await fetch(`${base}/api/v1/auth/cart-merge`, {
        cache: 'no-store',
        credentials: 'include',
        headers: {
          Origin: window.location.origin,
          'X-CSRF-Token': csrf.csrfToken,
        },
        method: 'POST',
      });
      const result = (await response.json()) as { cartMerge?: unknown };
      if (
        response.ok &&
        (result.cartMerge === 'succeeded' || result.cartMerge === 'not_present')
      ) {
        window.sessionStorage.removeItem('hb-cart-merge-warning');
        window.location.reload();
      }
    } catch {
      // Keep the generic warning visible so the user can retry again.
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.cartMergeNotice} role="alert">
      <span>
        You are signed in, but your guest cart could not be merged. It is still
        safe and can be retried.
      </span>
      <Button
        pending={pending}
        pendingLabel="Retrying…"
        onClick={() => void retry()}
      >
        Retry cart merge
      </Button>
    </div>
  );
}
