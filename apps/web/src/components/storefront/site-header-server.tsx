import 'server-only';

import { logoutAction } from '../../features/auth/auth-actions';
import { readCurrentSession } from '../../features/auth/read-current-session';
import { SiteHeaderClient } from './site-header';

export async function SiteHeaderServer() {
  const current = await readCurrentSession();
  const sessionState =
    current.kind === 'authenticated'
      ? ({
          kind: 'authenticated',
          isAdmin: current.session.user.role === 'ADMIN',
        } as const)
      : current;

  return (
    <SiteHeaderClient logoutAction={logoutAction} sessionState={sessionState} />
  );
}
