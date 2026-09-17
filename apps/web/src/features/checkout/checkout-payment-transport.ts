'use client';

import { createApiClient, type components } from '@hop-and-barley/api-client';

import { resolveBrowserApiUrl } from '../../lib/browser-api-url';

const DEFAULT_API_URL = 'http://localhost:3001';
const PAYMENT_REQUEST_TIMEOUT_MS = 1_500;
// Session creation/reconciliation can involve multiple bounded provider calls.
const PAYMENT_MUTATION_TIMEOUT_MS = 30_000;
const STRIPE_CHECKOUT_ORIGIN = 'https://checkout.stripe.com';

export type StripeCheckoutSession =
  components['schemas']['StripeCheckoutSessionDto'];
export type StripePaymentStatus =
  components['schemas']['StripePaymentStatusDto'];

export class CheckoutPaymentTransportError extends Error {
  constructor(readonly status: number) {
    super(`Checkout payment request failed with ${status}`);
  }
}

export type CheckoutPaymentTransport = Readonly<{
  reconcile(): Promise<StripePaymentStatus>;
  start(
    checkoutDraftId: string,
    idempotencyKey: string,
  ): Promise<StripeCheckoutSession>;
  status(): Promise<StripePaymentStatus | null>;
}>;

export function createBrowserCheckoutPaymentTransport(
  requestOrigin: () => string = () => window.location.origin,
  apiUrl = process.env.NEXT_PUBLIC_API_URL ?? DEFAULT_API_URL,
  apiHostAliases = process.env.NEXT_PUBLIC_API_HOST_ALIASES ?? '',
): CheckoutPaymentTransport {
  const requestContext = () => {
    const origin = requestOrigin();
    const client = createApiClient(
      resolveBrowserApiUrl(apiUrl, origin, apiHostAliases),
      {
        cache: 'no-store',
        credentials: 'include',
        redirect: 'error',
      },
    );
    return { client, origin };
  };

  return {
    async reconcile() {
      const { client, origin } = requestContext();
      const csrfToken = await loadCsrf(client);
      const { data, error, response } = await client.POST(
        '/api/v1/payments/stripe/reconcile',
        {
          params: { header: mutationHeaders(origin, csrfToken) },
          signal: AbortSignal.timeout(PAYMENT_MUTATION_TIMEOUT_MS),
        },
      );
      return paymentStatusFromResponse(data, error, response);
    },
    async start(checkoutDraftId, idempotencyKey) {
      const { client, origin } = requestContext();
      const csrfToken = await loadCsrf(client);
      const { data, error, response } = await client.POST(
        '/api/v1/payments/stripe/checkout-session',
        {
          body: { checkoutDraftId },
          params: {
            header: {
              ...mutationHeaders(origin, csrfToken),
              'Idempotency-Key': idempotencyKey,
            },
          },
          signal: AbortSignal.timeout(PAYMENT_MUTATION_TIMEOUT_MS),
        },
      );
      assertPrivateResponse(response);
      if (
        !response.ok ||
        error !== undefined ||
        !isStripeCheckoutSession(data)
      ) {
        throw new CheckoutPaymentTransportError(response.status);
      }
      return data;
    },
    async status() {
      const { client } = requestContext();
      const { data, error, response } = await client.GET(
        '/api/v1/payments/stripe/status',
        { signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS) },
      );
      assertPrivateResponse(response);
      if (response.status === 404) return null;
      if (!response.ok || error !== undefined || !isStripePaymentStatus(data)) {
        throw new CheckoutPaymentTransportError(response.status);
      }
      return data;
    },
  };
}

async function loadCsrf(client: ReturnType<typeof createApiClient>) {
  const { data, error, response } = await client.GET('/api/v1/cart/csrf', {
    signal: AbortSignal.timeout(PAYMENT_REQUEST_TIMEOUT_MS),
  });
  assertPrivateResponse(response);
  if (!response.ok || error !== undefined || !isCsrfToken(data)) {
    throw new CheckoutPaymentTransportError(response.status);
  }
  return data.csrfToken;
}

function mutationHeaders(origin: string, csrfToken: string) {
  return { Origin: origin, 'X-CSRF-Token': csrfToken };
}

function paymentStatusFromResponse(
  data: unknown,
  error: unknown,
  response: Response,
): StripePaymentStatus {
  assertPrivateResponse(response);
  if (!response.ok || error !== undefined || !isStripePaymentStatus(data)) {
    throw new CheckoutPaymentTransportError(response.status);
  }
  return data;
}

function assertPrivateResponse(response: Response) {
  const directives = new Set(
    (response.headers.get('cache-control') ?? '')
      .toLowerCase()
      .split(',')
      .map((directive) => directive.trim()),
  );
  if (!directives.has('private') || !directives.has('no-store')) {
    throw new CheckoutPaymentTransportError(response.status);
  }
}

function isStripeCheckoutSession(
  value: unknown,
): value is StripeCheckoutSession {
  return (
    isRecord(value) &&
    isUuidV4(value.attemptId) &&
    isStripeCheckoutUrl(value.checkoutUrl) &&
    isDateTime(value.expiresAt) &&
    value.status === 'ready_for_redirect'
  );
}

function isStripePaymentStatus(value: unknown): value is StripePaymentStatus {
  return (
    isRecord(value) &&
    isUuidV4(value.attemptId) &&
    (value.status === 'ready_for_redirect' ||
      value.status === 'processing' ||
      value.status === 'succeeded' ||
      value.status === 'failed' ||
      value.status === 'cancelled')
  );
}

function isStripeCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return (
      url.origin === STRIPE_CHECKOUT_ORIGIN &&
      url.username === '' &&
      url.password === '' &&
      url.port === ''
    );
  } catch {
    return false;
  }
}

function isUuidV4(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

function isDateTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.exec(
      value,
    );
  if (!match || Number.isNaN(Date.parse(value))) return false;

  const [year, month, day] = match.slice(1, 4).map(Number);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  return (
    calendarDate.getUTCFullYear() === year &&
    calendarDate.getUTCMonth() === month - 1 &&
    calendarDate.getUTCDate() === day
  );
}

function isCsrfToken(
  value: unknown,
): value is components['schemas']['CartCsrfResponseDto'] {
  return (
    isRecord(value) &&
    typeof value.csrfToken === 'string' &&
    /^[A-Za-z0-9_-]{1,16}\.[A-Za-z0-9_-]{43}$/u.test(value.csrfToken)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
