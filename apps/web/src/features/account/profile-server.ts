import 'server-only';

import { createApiClient, type components } from '@hop-and-barley/api-client';

import { resolveApiOrigin } from '../../lib/catalog';

const DEFAULT_API_URL = 'http://localhost:3001/api/v1';
const PROFILE_REQUEST_TIMEOUT_MS = 1_500;

export type CurrentUserProfile = components['schemas']['CurrentUserProfileDto'];

export type CurrentUserProfileResult =
  | Readonly<{ kind: 'anonymous' }>
  | Readonly<{ kind: 'authenticated'; profile: CurrentUserProfile }>
  | Readonly<{ kind: 'unavailable' }>;

export async function readCurrentUserProfile(
  sessionCookie: string | null,
  rawApiUrl = process.env.API_INTERNAL_URL ?? DEFAULT_API_URL,
): Promise<CurrentUserProfileResult> {
  if (!sessionCookie) return { kind: 'anonymous' };

  try {
    const client = createApiClient(resolveApiOrigin(rawApiUrl), {
      cache: 'no-store',
      fetch: async (request) => {
        const headers = new Headers(request.headers);
        headers.set('Cookie', sessionCookie);
        return globalThis.fetch(
          new Request(request, { cache: 'no-store', headers }),
        );
      },
    });
    const { data, error, response } = await client.GET('/api/v1/users/me', {
      signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
    });
    assertPrivateResponse(response);

    if (response.status === 401) return { kind: 'anonymous' };
    if (!response.ok || error !== undefined || !isCurrentUserProfile(data)) {
      return { kind: 'unavailable' };
    }
    return { kind: 'authenticated', profile: data };
  } catch {
    return { kind: 'unavailable' };
  }
}

function assertPrivateResponse(response: Response): void {
  const directives = new Set(
    (response.headers.get('cache-control') ?? '')
      .toLowerCase()
      .split(',')
      .map((directive) => directive.trim()),
  );
  if (!directives.has('private') || !directives.has('no-store')) {
    throw new Error('Private profile response is cacheable');
  }
}

function isCurrentUserProfile(value: unknown): value is CurrentUserProfile {
  if (!isRecord(value)) return false;
  return (
    typeof value.email === 'string' &&
    (value.role === 'CUSTOMER' || value.role === 'ADMIN') &&
    (value.profile === null || isRecord(value.profile)) &&
    (value.primaryAddress === null || isRecord(value.primaryAddress))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
