import 'server-only';

import { cookies } from 'next/headers';

import { selectSessionCookieHeader } from './auth-cookie';
import { getCurrentSession } from './auth-transport';

export async function readCurrentSession() {
  try {
    const cookieStore = await cookies();
    const sessionCookie = selectSessionCookieHeader(cookieStore.getAll());
    return await getCurrentSession(sessionCookie);
  } catch {
    return { kind: 'unavailable' } as const;
  }
}
