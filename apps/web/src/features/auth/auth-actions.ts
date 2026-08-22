'use server';

import 'server-only';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { selectSessionCookieHeader, type SessionCookie } from './auth-cookie';
import { logoutCurrentSession } from './auth-transport';
import type { AuthFormState } from './auth-state';

export async function logoutAction(
  _previousState: AuthFormState,
  _formData: FormData,
): Promise<AuthFormState> {
  void _previousState;
  void _formData;
  const cookieStore = await cookies();
  const sessionCookie = selectSessionCookieHeader(cookieStore.getAll());
  const origin = await readExactRequestOrigin();
  if (!origin) return { status: 'unavailable' };

  const result = await logoutCurrentSession(sessionCookie, origin);
  if (result.kind === 'unavailable') return { status: 'unavailable' };

  if (result.kind === 'signed-out') {
    cookieStore.set(result.cookie);
  } else if (sessionCookie) {
    cookieStore.set(clearCookieFor(sessionCookie));
  }
  redirect('/login?status=signed-out');
}

async function readExactRequestOrigin(): Promise<string | null> {
  const origin = (await headers()).get('origin');
  if (!origin) return null;

  try {
    const url = new URL(origin);
    if (
      (url.protocol !== 'http:' && url.protocol !== 'https:') ||
      url.origin !== origin ||
      url.username !== '' ||
      url.password !== ''
    ) {
      return null;
    }
    return origin;
  } catch {
    return null;
  }
}

function clearCookieFor(sessionCookie: string): SessionCookie {
  const name = sessionCookie.startsWith('__Host-hb_session=')
    ? '__Host-hb_session'
    : 'hb_session';
  return {
    expires: new Date(0),
    httpOnly: true,
    maxAge: 0,
    name,
    path: '/',
    sameSite: 'lax',
    secure: name === '__Host-hb_session',
    value: '',
  };
}
