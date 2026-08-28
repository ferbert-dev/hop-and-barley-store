'use client';

import { createApiClient, type components } from '@hop-and-barley/api-client';

import { resolveBrowserApiUrl } from '../../lib/browser-api-url';

const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const PUBLIC_API_HOST_ALIASES = process.env.NEXT_PUBLIC_API_HOST_ALIASES ?? '';
const PROFILE_REQUEST_TIMEOUT_MS = 1_500;

export type CurrentUserProfile = components['schemas']['CurrentUserProfileDto'];
export type ProfilePatch = components['schemas']['UpdateCurrentUserDto'];
export type AvatarMetadata = components['schemas']['AvatarMetadataDto'];

export type ProfileSaveResult =
  | Readonly<{ kind: 'saved'; profile: CurrentUserProfile }>
  | Readonly<{
      kind: 'invalid' | 'unauthenticated' | 'unavailable';
    }>;

export type AvatarSaveResult =
  | Readonly<{ kind: 'saved'; avatar: AvatarMetadata }>
  | Readonly<{
      kind: 'invalid' | 'too-large' | 'unauthenticated' | 'unavailable';
    }>;

export type AvatarDeleteResult = Readonly<{
  kind: 'deleted' | 'unauthenticated' | 'unavailable';
}>;

export async function saveProfileFromBrowser(
  patch: ProfilePatch,
): Promise<ProfileSaveResult> {
  try {
    const client = browserClient();
    const csrfToken = await readCsrfToken(client);
    if (!csrfToken) return { kind: 'unauthenticated' };

    const { data, error, response } = await client.PATCH('/api/v1/users/me', {
      body: patch,
      params: { header: mutationHeaders(csrfToken) },
      signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
    });
    assertPrivateResponse(response);

    if (response.status === 401) return { kind: 'unauthenticated' };
    if (response.status === 400) return { kind: 'invalid' };
    if (!response.ok || error !== undefined || !isCurrentUserProfile(data)) {
      return { kind: 'unavailable' };
    }
    return { kind: 'saved', profile: data };
  } catch {
    return { kind: 'unavailable' };
  }
}

export async function saveAvatarFromBrowser(
  file: File,
): Promise<AvatarSaveResult> {
  try {
    const client = browserClient();
    const csrfToken = await readCsrfToken(client);
    if (!csrfToken) return { kind: 'unauthenticated' };

    const body = new FormData();
    body.set('file', file, file.name);
    const { data, error, response } = await client.PUT(
      '/api/v1/users/me/avatar',
      {
        // The generated OpenAPI schema uses `string` for binary multipart
        // fields. The browser transport must retain the actual FormData body.
        body: body as unknown as { file: string },
        params: { header: mutationHeaders(csrfToken) },
        signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
      },
    );
    assertPrivateResponse(response);

    if (response.status === 401) return { kind: 'unauthenticated' };
    if (response.status === 400 || response.status === 415) {
      return { kind: 'invalid' };
    }
    if (response.status === 413) return { kind: 'too-large' };
    if (!response.ok || error !== undefined || !isAvatarMetadata(data)) {
      return { kind: 'unavailable' };
    }
    return { kind: 'saved', avatar: data };
  } catch {
    return { kind: 'unavailable' };
  }
}

export async function deleteAvatarFromBrowser(): Promise<AvatarDeleteResult> {
  try {
    const client = browserClient();
    const csrfToken = await readCsrfToken(client);
    if (!csrfToken) return { kind: 'unauthenticated' };

    const { error, response } = await client.DELETE('/api/v1/users/me/avatar', {
      params: { header: mutationHeaders(csrfToken) },
      signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
    });
    assertPrivateResponse(response);

    if (response.status === 401) return { kind: 'unauthenticated' };
    return response.ok && error === undefined
      ? { kind: 'deleted' }
      : { kind: 'unavailable' };
  } catch {
    return { kind: 'unavailable' };
  }
}

export function browserAvatarUrl(): string {
  return `${resolveBrowserApiUrl(
    PUBLIC_API_URL,
    window.location.origin,
    PUBLIC_API_HOST_ALIASES,
  )}/api/v1/users/me/avatar`;
}

function browserClient() {
  return createApiClient(
    resolveBrowserApiUrl(
      PUBLIC_API_URL,
      window.location.origin,
      PUBLIC_API_HOST_ALIASES,
    ),
    { cache: 'no-store', credentials: 'include' },
  );
}

async function readCsrfToken(
  client: ReturnType<typeof createApiClient>,
): Promise<string | null> {
  const { data, error, response } = await client.GET('/api/v1/auth/csrf', {
    signal: AbortSignal.timeout(PROFILE_REQUEST_TIMEOUT_MS),
  });
  assertPrivateResponse(response);
  if (response.status === 401 || !response.ok || error !== undefined) {
    return null;
  }
  return isCsrfResponse(data) ? data.csrfToken : null;
}

function mutationHeaders(csrfToken: string) {
  return { Origin: window.location.origin, 'X-CSRF-Token': csrfToken };
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

function isCsrfResponse(
  value: unknown,
): value is components['schemas']['CsrfResponseDto'] {
  return (
    isRecord(value) &&
    typeof value.csrfToken === 'string' &&
    /^[A-Za-z0-9_-]{1,16}\.[A-Za-z0-9_-]{43}$/u.test(value.csrfToken)
  );
}

function isAvatarMetadata(value: unknown): value is AvatarMetadata {
  return (
    isRecord(value) &&
    (value.contentType === 'image/jpeg' ||
      value.contentType === 'image/png' ||
      value.contentType === 'image/webp') &&
    typeof value.sizeBytes === 'number' &&
    typeof value.updatedAt === 'string'
  );
}

function isCurrentUserProfile(value: unknown): value is CurrentUserProfile {
  return (
    isRecord(value) &&
    typeof value.email === 'string' &&
    (value.role === 'CUSTOMER' || value.role === 'ADMIN') &&
    (value.profile === null || isRecord(value.profile)) &&
    (value.primaryAddress === null || isRecord(value.primaryAddress))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
