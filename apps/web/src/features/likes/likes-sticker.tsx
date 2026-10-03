'use client';

import { Heart } from '@phosphor-icons/react/dist/ssr';
import { usePathname } from 'next/navigation';

import { useLikes } from './likes-context';
import styles from './likes.module.css';

export function LikesSticker() {
  const pathname = usePathname();
  const { count, state } = useLikes();

  if (pathname.startsWith('/admin')) return null;

  const countLabel =
    state === 'ready' && count !== null
      ? `${String(count)} ${count === 1 ? 'like' : 'likes'}`
      : state === 'loading'
        ? 'Loading community likes'
        : 'Community likes are temporarily unavailable';

  return (
    <aside aria-label="Community likes" className={styles.sticker}>
      <Heart aria-hidden className={styles.icon} size={28} weight="fill" />
      <div>
        <p className={styles.eyebrow}>Our community likes this shop</p>
        <p className={styles.count} aria-label={countLabel}>
          {state === 'ready' && count !== null ? (
            <>
              {count.toLocaleString('en-GB')}
              <span aria-hidden> likes</span>
            </>
          ) : state === 'loading' ? (
            'Loading…'
          ) : (
            'Unavailable'
          )}
        </p>
        <p className={styles.prompt}>
          {state === 'ready'
            ? 'Complete a test purchase to leave your like.'
            : state === 'loading'
              ? 'Loading the community count…'
              : 'The community count will be back soon.'}
        </p>
      </div>
    </aside>
  );
}
