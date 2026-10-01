'use client';

import { createApiClient, type components } from '@hop-and-barley/api-client';

import { resolveBrowserApiUrl } from '../../lib/browser-api-url';

const DEFAULT_API_URL = 'http://localhost:3001';
const LIKES_REQUEST_TIMEOUT_MS = 1_500;

export type PurchaseLikeCount = components['schemas']['PurchaseLikeCountDto'];
export type PurchaseLikeResponse =
  components['schemas']['PurchaseLikeResponseDto'];

export class LikesTransportError extends Error {
  constructor(readonly status: number) {
    super(`Likes request failed with ${String(status)}`);
  }
}

export type LikesTransport = Readonly<{
  count(): Promise<PurchaseLikeCount>;
  create(paymentAttemptId: string): Promise<PurchaseLikeResponse>;
}>;

export function createBrowserLikesTransport(
  requestOrigin: () => string = () => window.location.origin,
  apiUrl = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL,
  apiHostAliases = process.env.NEXT_PUBLIC_API_HOST_ALIASES ?? '',
): LikesTransport {
  const client = () =>
    createApiClient(
      resolveBrowserApiUrl(apiUrl, requestOrigin(), apiHostAliases),
      { cache: 'no-store', credentials: 'include', redirect: 'error' },
    );

  return {
    async count() {
      const { data, error, response } = await client().GET('/api/v1/likes', {
        signal: AbortSignal.timeout(LIKES_REQUEST_TIMEOUT_MS),
      });
      return countFromResponse(data, error, response);
    },
    async create(paymentAttemptId) {
      const requestContext = client();
      const csrfToken = await loadCsrf(requestContext);
      const { data, error, response } = await requestContext.POST(
        '/api/v1/likes',
        {
          body: { paymentAttemptId },
          params: {
            header: {
              Origin: requestOrigin(),
              'X-CSRF-Token': csrfToken,
            },
          },
          signal: AbortSignal.timeout(LIKES_REQUEST_TIMEOUT_MS),
        },
      );
      if (
        !response.ok ||
        error !== undefined ||
        !isPurchaseLikeResponse(data)
      ) {
        throw new LikesTransportError(response.status);
      }
      return data;
    },
  };
}

async function loadCsrf(client: ReturnType<typeof createApiClient>) {
  const { data, error, response } = await client.GET('/api/v1/cart/csrf', {
    signal: AbortSignal.timeout(LIKES_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok || error !== undefined || !isCsrfToken(data)) {
    throw new LikesTransportError(response.status);
  }
  return data.csrfToken;
}

function countFromResponse(data: unknown, error: unknown, response: Response) {
  if (!response.ok || error !== undefined || !isPurchaseLikeCount(data)) {
    throw new LikesTransportError(response.status);
  }
  return data;
}

function isPurchaseLikeCount(value: unknown): value is PurchaseLikeCount {
  return (
    typeof value === 'object' &&
    value !== null &&
    'count' in value &&
    typeof value.count === 'number' &&
    Number.isSafeInteger(value.count) &&
    value.count >= 0
  );
}

function isPurchaseLikeResponse(value: unknown): value is PurchaseLikeResponse {
  return isPurchaseLikeCount(value) && 'liked' in value && value.liked === true;
}

function isCsrfToken(value: unknown): value is { csrfToken: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'csrfToken' in value &&
    typeof value.csrfToken === 'string' &&
    /^[A-Za-z0-9_-]{1,16}\.[A-Za-z0-9_-]{43}$/u.test(value.csrfToken)
  );
}
