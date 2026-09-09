'use client';

import { createApiClient, type components } from '@hop-and-barley/api-client';

import { resolveBrowserApiUrl } from '../../lib/browser-api-url';

const DEFAULT_API_URL = 'http://localhost:3001';
const CHECKOUT_REQUEST_TIMEOUT_MS = 1_500;

export type CheckoutDraft = components['schemas']['CheckoutDraftDto'];
export type SaveCheckoutDraft = components['schemas']['SaveCheckoutDraftDto'];

export class CheckoutTransportError extends Error {
  constructor(readonly status: number) {
    super(`Checkout draft request failed with ${status}`);
  }
}

export type CheckoutTransport = Readonly<{
  loadDraft(): Promise<CheckoutDraft | null>;
  saveDraft(
    draft: SaveCheckoutDraft,
    idempotencyKey: string,
  ): Promise<CheckoutDraft>;
}>;

export function createBrowserCheckoutTransport(
  requestOrigin: () => string = () => window.location.origin,
  apiUrl = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL,
  apiHostAliases = process.env.NEXT_PUBLIC_API_HOST_ALIASES ?? '',
): CheckoutTransport {
  const requestContext = () => {
    const origin = requestOrigin();
    const client = createApiClient(
      resolveBrowserApiUrl(apiUrl, origin, apiHostAliases),
      { cache: 'no-store', credentials: 'include' },
    );
    return { client, origin };
  };

  return {
    async loadDraft() {
      const { client } = requestContext();
      const { data, error, response } = await client.GET(
        '/api/v1/checkout/draft',
        {
          signal: AbortSignal.timeout(CHECKOUT_REQUEST_TIMEOUT_MS),
        },
      );
      assertPrivate(response);
      if (response.status === 404 || response.status === 401) return null;
      if (!response.ok || error !== undefined || !isCheckoutDraft(data)) {
        throw new CheckoutTransportError(response.status);
      }
      return data;
    },
    async saveDraft(draft, idempotencyKey) {
      const { client, origin } = requestContext();
      const csrfToken = await loadCsrf(client);
      const { data, error, response } = await client.POST(
        '/api/v1/checkout/draft',
        {
          body: draft,
          params: {
            header: {
              'Idempotency-Key': idempotencyKey,
              Origin: origin,
              'X-CSRF-Token': csrfToken,
            },
          },
          signal: AbortSignal.timeout(CHECKOUT_REQUEST_TIMEOUT_MS),
        },
      );
      assertPrivate(response);
      if (!response.ok || error !== undefined || !isCheckoutDraft(data)) {
        throw new CheckoutTransportError(response.status);
      }
      return data;
    },
  };
}

async function loadCsrf(client: ReturnType<typeof createApiClient>) {
  const { data, error, response } = await client.GET('/api/v1/cart/csrf', {
    signal: AbortSignal.timeout(CHECKOUT_REQUEST_TIMEOUT_MS),
  });
  assertPrivate(response);
  if (!response.ok || error !== undefined || !isCsrfToken(data)) {
    throw new CheckoutTransportError(response.status);
  }
  return data.csrfToken;
}

function assertPrivate(response: Response) {
  const directives = new Set(
    (response.headers.get('cache-control') ?? '')
      .toLowerCase()
      .split(',')
      .map((directive) => directive.trim()),
  );
  if (!directives.has('private') || !directives.has('no-store')) {
    throw new CheckoutTransportError(response.status);
  }
}

function isCsrfToken(value: unknown): value is { csrfToken: string } {
  return (
    isRecord(value) &&
    typeof value.csrfToken === 'string' &&
    /^v1\.[A-Za-z0-9_-]{43}$/u.test(value.csrfToken)
  );
}

function isCheckoutDraft(value: unknown): value is CheckoutDraft {
  return (
    isRecord(value) &&
    value.status === 'pre_payment' &&
    (value.paymentMethod === 'stripe_debit_card' ||
      value.paymentMethod === 'cash_on_delivery') &&
    typeof value.email === 'string' &&
    typeof value.fullName === 'string' &&
    typeof value.phoneNumber === 'string' &&
    isRecord(value.delivery)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
