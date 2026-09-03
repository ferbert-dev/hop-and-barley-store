'use client';

import { createApiClient } from '@hop-and-barley/api-client';
import { useEffect, useState } from 'react';
import { resolveBrowserApiUrl } from '../../lib/browser-api-url';
import { Button } from '../../components/ui/button';
import styles from './auth.module.css';

const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PUBLIC_API_HOST_ALIASES = process.env.NEXT_PUBLIC_API_HOST_ALIASES ?? '';
const CART_MERGE_RETRY_TIMEOUT_MS = 1_500;

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
      const origin = window.location.origin;
      const client = createApiClient(
        resolveBrowserApiUrl(PUBLIC_API_URL, origin, PUBLIC_API_HOST_ALIASES),
        { cache: 'no-store', credentials: 'include' },
      );
      const csrf = await client.GET('/api/v1/auth/csrf', {
        signal: AbortSignal.timeout(CART_MERGE_RETRY_TIMEOUT_MS),
      });
      if (
        !csrf.response.ok ||
        csrf.error !== undefined ||
        typeof csrf.data?.csrfToken !== 'string'
      ) {
        return;
      }
      const merge = await client.POST('/api/v1/auth/cart-merge', {
        params: {
          header: {
            Origin: origin,
            'X-CSRF-Token': csrf.data.csrfToken,
          },
        },
        signal: AbortSignal.timeout(CART_MERGE_RETRY_TIMEOUT_MS),
      });
      if (
        merge.response.ok &&
        merge.error === undefined &&
        (merge.data?.cartMerge === 'succeeded' ||
          merge.data?.cartMerge === 'not_present')
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
