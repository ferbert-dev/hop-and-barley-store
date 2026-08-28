'use client';

import { createApiClient } from '@hop-and-barley/api-client';

import { resolveBrowserApiUrl } from '../../lib/browser-api-url';
import type { AuthFormState } from './auth-state';
import {
  safeReturnPath,
  validateLoginInput,
  validateRegistrationInput,
} from './auth-validation';

const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PUBLIC_API_HOST_ALIASES = process.env.NEXT_PUBLIC_API_HOST_ALIASES ?? '';
const AUTH_REQUEST_TIMEOUT_MS = 1_500;

export async function registerFromBrowser(
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = validateRegistrationInput(readRegistrationInput(formData));
  if (!input.ok) return { errors: input.errors, status: 'invalid' };
  try {
    const { data, error, response } = await browserClient().POST(
      '/api/v1/auth/register',
      {
        body: input.value,
        signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      },
    );
    assertPrivate(response);
    return response.status === 202 && !error && data?.status === 'accepted'
      ? { status: 'accepted' }
      : response.status === 400
        ? { status: 'invalid' }
        : { status: 'unavailable' };
  } catch {
    return { status: 'unavailable' };
  }
}

export async function loginFromBrowser(
  returnTo: string,
  _previous: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const input = validateLoginInput(readLoginInput(formData));
  if (!input.ok) return { errors: input.errors, status: 'invalid' };
  try {
    const origin = window.location.origin;
    const { error, response } = await browserClient().POST(
      '/api/v1/auth/login',
      {
        body: input.value,
        params: { header: { Origin: origin } },
        signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      },
    );
    assertPrivate(response);
    if (response.status === 401 || response.status === 400) {
      return { status: 'invalid' };
    }
    if (!response.ok || error) return { status: 'unavailable' };
    window.location.assign(safeReturnPath(returnTo));
    return { status: 'idle' };
  } catch {
    return { status: 'unavailable' };
  }
}

function browserClient() {
  return createApiClient(
    resolveBrowserApiUrl(
      PUBLIC_API_URL,
      window.location.origin,
      PUBLIC_API_HOST_ALIASES,
    ),
    {
      cache: 'no-store',
      credentials: 'include',
    },
  );
}

function assertPrivate(response: Response) {
  const cache = response.headers.get('cache-control') ?? '';
  if (!cache.includes('private') || !cache.includes('no-store')) {
    throw new Error('Private auth response is cacheable');
  }
}

function readCredentials(formData: FormData) {
  return {
    email: String(formData.get('email') ?? ''),
    password: String(formData.get('password') ?? ''),
  };
}

function readRegistrationInput(formData: FormData) {
  return {
    ...readCredentials(formData),
    confirmPassword: String(formData.get('confirmPassword') ?? ''),
  };
}

function readLoginInput(formData: FormData) {
  return {
    ...readCredentials(formData),
    rememberMe: formData.get('rememberMe') === 'true',
  };
}
