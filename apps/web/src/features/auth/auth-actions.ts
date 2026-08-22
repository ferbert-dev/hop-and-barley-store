'use server';

import 'server-only';

import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { selectSessionCookieHeader, type SessionCookie } from './auth-cookie';
import {
  loginWithPassword,
  logoutCurrentSession,
  registerWithPassword,
} from './auth-transport';
import type { AuthFormState } from './auth-state';
import {
  safeReturnPath,
  validateLoginInput,
  validateRegistrationInput,
  type AuthCredentials,
} from './auth-validation';

export async function registerAction(
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = validateRegistrationInput(readCredentials(formData));
  if (!validated.ok) return { errors: validated.errors, status: 'invalid' };

  const origin = await readExactRequestOrigin();
  if (!origin) return { status: 'unavailable' };

  const result = await registerWithPassword(validated.value, origin);
  if (result.kind === 'accepted') return { status: 'accepted' };
  if (result.kind === 'invalid') return { status: 'invalid' };
  return { status: 'unavailable' };
}

export async function loginAction(
  returnTo: string,
  _previousState: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const validated = validateLoginInput(readCredentials(formData));
  if (!validated.ok) return { errors: validated.errors, status: 'invalid' };

  const origin = await readExactRequestOrigin();
  if (!origin) return { status: 'unavailable' };

  const result = await loginWithPassword(validated.value, origin);
  if (result.kind === 'invalid') return { status: 'invalid' };
  if (result.kind === 'unavailable') return { status: 'unavailable' };

  (await cookies()).set(result.cookie);
  redirect(safeReturnPath(returnTo));
}

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

function readCredentials(formData: FormData): AuthCredentials {
  const email = formData.get('email');
  const password = formData.get('password');
  return {
    email: typeof email === 'string' ? email : '',
    password: typeof password === 'string' ? password : '',
  };
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
