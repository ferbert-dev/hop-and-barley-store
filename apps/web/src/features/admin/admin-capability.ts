import 'server-only';

import { createApiClient, type components } from '@hop-and-barley/api-client';
import { cookies } from 'next/headers';

import { resolveApiOrigin } from '../../lib/catalog';
import { selectSessionCookieHeader } from '../auth/auth-cookie';

const DEFAULT_API_URL = 'http://localhost:3001/api/v1';
const ADMIN_REQUEST_TIMEOUT_MS = 1_500;
const TRUSTED_LOCAL_API_HOSTS = new Set(['api', 'localhost']);

export type AdminCapabilityResult =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{ kind: 'authorized' }>
  | Readonly<{ kind: 'denied' }>;

export async function readAdminCapability(): Promise<AdminCapabilityResult> {
  try {
    const cookieStore = await cookies();
    return getAdminCapability(selectSessionCookieHeader(cookieStore.getAll()));
  } catch {
    return { kind: 'denied' };
  }
}

export async function getAdminCapability(
  sessionCookie: string | null,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<AdminCapabilityResult> {
  if (!sessionCookie) return { kind: 'anonymous' };

  try {
    const client = createApiClient(resolveTrustedAdminApiOrigin(rawApiUrl), {
      cache: 'no-store',
      fetch: async (request) => {
        const headers = new Headers(request.headers);
        headers.set('Cookie', sessionCookie);
        return globalThis.fetch(
          new Request(request, { cache: 'no-store', headers }),
        );
      },
    });
    const { data, error, response } = await client.GET(
      '/api/v1/admin/capabilities',
      { signal: AbortSignal.timeout(ADMIN_REQUEST_TIMEOUT_MS) },
    );
    assertPrivateResponse(response);

    if (response.status === 401) return { kind: 'anonymous' };
    if (
      response.status === 200 &&
      error === undefined &&
      isAdminCapabilities(data)
    ) {
      return { kind: 'authorized' };
    }
    return { kind: 'denied' };
  } catch {
    return { kind: 'denied' };
  }
}

export function resolveTrustedAdminApiOrigin(rawApiUrl: string): string {
  const origin = resolveApiOrigin(rawApiUrl);
  const { hostname } = new URL(origin);
  if (!TRUSTED_LOCAL_API_HOSTS.has(hostname)) {
    throw new TypeError('Admin API origin is not an approved local target');
  }
  return origin;
}

function assertPrivateResponse(response: Response): void {
  const directives = new Set(
    (response.headers.get('cache-control') ?? '')
      .toLowerCase()
      .split(',')
      .map((directive) => directive.trim()),
  );
  if (!directives.has('private') || !directives.has('no-store')) {
    throw new Error('Private admin response is cacheable');
  }
}

function isAdminCapabilities(
  value: unknown,
): value is components['schemas']['AdminCapabilitiesDto'] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const capability = value as Record<string, unknown>;
  return capability.productManagement === true;
}
