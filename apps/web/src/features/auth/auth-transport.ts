import 'server-only';

import { createApiClient, type components } from '@hop-and-barley/api-client';

import { resolveApiOrigin } from '../../lib/catalog';
import { parseUpstreamSessionCookie, type SessionCookie } from './auth-cookie';
import type { AuthCredentials, LoginCredentials } from './auth-validation';

const DEFAULT_API_URL = 'http://localhost:3001/api/v1';
const AUTH_REQUEST_TIMEOUT_MS = 1_500;

export type AuthSession = components['schemas']['AuthSessionDto'];

export type RegistrationResult =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'unavailable' }>;

export type LoginResult =
  | Readonly<{
      cookie: SessionCookie;
      kind: 'authenticated';
      session: AuthSession;
    }>
  | Readonly<{ kind: 'invalid' }>
  | Readonly<{ kind: 'unavailable' }>;

export type CurrentSessionResult =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{ kind: 'authenticated'; session: AuthSession }>
  | Readonly<{ kind: 'unavailable' }>;

export type LogoutResult =
  | Readonly<{ cookie: SessionCookie; kind: 'signed-out' }>
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{ kind: 'unavailable' }>;

export async function registerWithPassword(
  credentials: AuthCredentials,
  origin: string,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<RegistrationResult> {
  try {
    const client = authClient(rawApiUrl, { origin });
    const { data, error, response } = await client.POST(
      '/api/v1/auth/register',
      {
        body: credentials,
        signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      },
    );
    assertPrivateResponse(response);

    if (
      response.status === 202 &&
      error === undefined &&
      isRecord(data) &&
      data.status === 'accepted'
    ) {
      return { kind: 'accepted' };
    }
    if (response.status === 400) return { kind: 'invalid' };
    return { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

export async function loginWithPassword(
  credentials: LoginCredentials,
  origin: string,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<LoginResult> {
  try {
    const client = authClient(rawApiUrl, { origin });
    const { data, error, response } = await client.POST('/api/v1/auth/login', {
      body: credentials,
      params: { header: { Origin: origin } },
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });
    assertPrivateResponse(response);

    if (response.status === 401 || response.status === 400) {
      return { kind: 'invalid' };
    }
    if (!response.ok || error !== undefined || !isAuthSession(data)) {
      return { kind: 'unavailable' };
    }

    const setCookie = response.headers.get('set-cookie');
    if (!setCookie) return { kind: 'unavailable' };

    return {
      cookie: parseUpstreamSessionCookie(setCookie),
      kind: 'authenticated',
      session: data,
    };
  } catch {
    return { kind: 'unavailable' };
  }
}

export async function getCurrentSession(
  sessionCookie: string | null,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<CurrentSessionResult> {
  if (!sessionCookie) return { kind: 'anonymous' };

  try {
    const client = authClient(rawApiUrl, { cookie: sessionCookie });
    const { data, error, response } = await client.GET('/api/v1/auth/session', {
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });
    assertPrivateResponse(response);

    if (response.status === 401) return { kind: 'anonymous' };
    if (!response.ok || error !== undefined || !isAuthSession(data)) {
      return { kind: 'unavailable' };
    }
    return { kind: 'authenticated', session: data };
  } catch {
    return { kind: 'unavailable' };
  }
}

export async function logoutCurrentSession(
  sessionCookie: string | null,
  origin: string,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<LogoutResult> {
  if (!sessionCookie) return { kind: 'anonymous' };

  try {
    const csrfClient = authClient(rawApiUrl, { cookie: sessionCookie });
    const csrf = await csrfClient.GET('/api/v1/auth/csrf', {
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });
    assertPrivateResponse(csrf.response);
    if (csrf.response.status === 401) return { kind: 'anonymous' };
    if (
      !csrf.response.ok ||
      csrf.error !== undefined ||
      !isCsrfResponse(csrf.data)
    ) {
      return { kind: 'unavailable' };
    }

    const client = authClient(rawApiUrl, {
      cookie: sessionCookie,
      csrfToken: csrf.data.csrfToken,
      origin,
    });
    const result = await client.POST('/api/v1/auth/logout', {
      params: {
        header: {
          Origin: origin,
          'X-CSRF-Token': csrf.data.csrfToken,
        },
      },
      signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
    });
    assertPrivateResponse(result.response);
    if (result.response.status === 401) return { kind: 'anonymous' };
    if (
      !result.response.ok ||
      result.error !== undefined ||
      !isRecord(result.data) ||
      result.data.status !== 'signed-out'
    ) {
      return { kind: 'unavailable' };
    }

    const setCookie = result.response.headers.get('set-cookie');
    if (!setCookie) return { kind: 'unavailable' };
    return {
      cookie: parseUpstreamSessionCookie(setCookie),
      kind: 'signed-out',
    };
  } catch {
    return { kind: 'unavailable' };
  }
}

type AuthClientContext = Readonly<{
  cookie?: string;
  csrfToken?: string;
  origin?: string;
}>;

function authClient(rawApiUrl: string, context: AuthClientContext) {
  return createApiClient(resolveApiOrigin(rawApiUrl), {
    cache: 'no-store',
    fetch: async (request) => {
      const headers = new Headers(request.headers);
      if (context.cookie) headers.set('Cookie', context.cookie);
      if (context.csrfToken) headers.set('X-CSRF-Token', context.csrfToken);
      if (context.origin) headers.set('Origin', context.origin);

      return globalThis.fetch(
        new Request(request, { cache: 'no-store', headers }),
      );
    },
  });
}

function assertPrivateResponse(response: Response): void {
  const directives = new Set(
    (response.headers.get('cache-control') ?? '')
      .toLowerCase()
      .split(',')
      .map((directive) => directive.trim()),
  );
  if (!directives.has('private') || !directives.has('no-store')) {
    throw new Error('Private auth response is cacheable');
  }
}

function isAuthSession(value: unknown): value is AuthSession {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  return (
    isDateTime(value.absoluteExpiresAt) &&
    isDateTime(value.idleExpiresAt) &&
    isDateTime(value.issuedAt) &&
    typeof value.user.id === 'string' &&
    (value.user.role === 'CUSTOMER' || value.user.role === 'ADMIN') &&
    value.user.status === 'ACTIVE'
  );
}

function isCsrfResponse(
  value: unknown,
): value is components['schemas']['CsrfResponseDto'] {
  return (
    isRecord(value) &&
    typeof value.csrfToken === 'string' &&
    /^[A-Za-z0-9_-]{1,16}\.[A-Za-z0-9_-]{43}$/u.test(value.csrfToken)
  );
}

function isDateTime(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= 64 &&
    !Number.isNaN(Date.parse(value))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
