import { Suspense, type ReactNode } from 'react';

import { logoutAction } from '../../features/auth/auth-actions';
import { SHOW_LIKES_BANNER } from '../../features/likes/likes-config';
import { LikesSticker } from '../../features/likes/likes-sticker';
import { SiteFooter } from './site-footer';
import { SiteHeaderClient } from './site-header';
import { SiteHeaderServer } from './site-header-server';

type StorefrontShellProps = Readonly<{
  children: ReactNode;
}>;

export function StorefrontShell({ children }: StorefrontShellProps) {
  return (
    <>
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <Suspense
        fallback={
          <SiteHeaderClient
            logoutAction={logoutAction}
            sessionState={{ kind: 'loading' }}
          />
        }
      >
        <SiteHeaderServer />
      </Suspense>
      <main id="main-content" tabIndex={-1}>
        {children}
      </main>
      {SHOW_LIKES_BANNER && <LikesSticker />}
      <SiteFooter />
    </>
  );
}
