import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import Stripe from 'stripe';

const PAYMENT_UNAVAILABLE = Object.freeze({
  status: 'payment-unavailable' as const,
});

export type StripeCheckoutSnapshot = Readonly<{
  currency: string;
  discountMinor: number;
  email: string;
  id: string;
  itemCount: number;
  itemSubtotalMinor: number;
  ownerReference: string;
  shippingMinor: number;
  totalMinor: number;
}>;

export type CreatedStripeCheckout = Readonly<{
  amountTotal: number;
  attemptId: string | null;
  checkoutUrl: string | null;
  currency: string;
  expiresAt: Date;
  paymentIntentId: string | null;
  paymentStatus: string;
  ownerReference: string | null;
  sessionId: string;
  sessionStatus: 'complete' | 'expired' | 'open';
}>;

@Injectable()
export class StripeGatewayService {
  private stripe: Stripe | null = null;

  constructor(private readonly config: ConfigService) {}

  enabled(): boolean {
    return this.config.get<boolean>('STRIPE_PAYMENTS_ENABLED') === true;
  }

  constructEvent(rawBody: Buffer, signature: string): Stripe.Event {
    return this.providerClient().webhooks.constructEvent(
      rawBody,
      signature,
      this.config.getOrThrow<string>('STRIPE_SANDBOX_WEBHOOK_SECRET'),
    );
  }

  async createCheckoutSession(
    attempt: StripeCheckoutSnapshot,
    requestedNow: Date,
  ): Promise<CreatedStripeCheckout> {
    if (!this.enabled()) {
      throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
    }
    const productsNetMinor = attempt.itemSubtotalMinor - attempt.discountMinor;
    const session = await this.providerClient().checkout.sessions.create(
      {
        automatic_tax: { enabled: false },
        cancel_url: this.config.getOrThrow<string>(
          'STRIPE_CHECKOUT_CANCEL_URL',
        ),
        client_reference_id: attempt.id,
        customer_email: attempt.email,
        expires_at: Math.floor(requestedNow.getTime() / 1_000) + 31 * 60,
        integration_identifier: integrationIdentifier(attempt.id),
        line_items: [
          {
            price_data: {
              currency: 'eur',
              product_data: {
                name:
                  attempt.discountMinor > 0
                    ? `Products (${attempt.itemCount}) — account discount applied`
                    : `Products (${attempt.itemCount})`,
              },
              unit_amount: productsNetMinor,
            },
            quantity: 1,
          },
          {
            price_data: {
              currency: 'eur',
              product_data: { name: 'Delivery' },
              unit_amount: attempt.shippingMinor,
            },
            quantity: 1,
          },
        ],
        metadata: {
          environment: 'sandbox',
          owner_reference: attempt.ownerReference,
          payment_attempt_id: attempt.id,
        },
        mode: 'payment',
        payment_intent_data: {
          capture_method: 'manual',
          metadata: {
            environment: 'sandbox',
            owner_reference: attempt.ownerReference,
            payment_attempt_id: attempt.id,
          },
        },
        payment_method_configuration: this.config.getOrThrow<string>(
          'STRIPE_PAYMENT_METHOD_CONFIGURATION_ID',
        ),
        success_url: this.config.getOrThrow<string>(
          'STRIPE_CHECKOUT_SUCCESS_URL',
        ),
      },
      {
        idempotencyKey: `o2p-session-${attempt.id}`,
      },
    );
    const paymentIntentId = providerObjectId(session.payment_intent);
    if (
      session.livemode ||
      !session.url ||
      session.client_reference_id !== attempt.id ||
      session.metadata?.environment !== 'sandbox' ||
      session.metadata.owner_reference !== attempt.ownerReference ||
      session.metadata.payment_attempt_id !== attempt.id ||
      session.currency !== attempt.currency.toLowerCase() ||
      session.amount_total !== attempt.totalMinor ||
      session.payment_status !== 'unpaid' ||
      session.status !== 'open'
    ) {
      throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
    }
    return {
      amountTotal: session.amount_total,
      attemptId: session.metadata.payment_attempt_id,
      checkoutUrl: session.url,
      currency: session.currency,
      expiresAt: new Date(session.expires_at * 1_000),
      paymentIntentId,
      paymentStatus: session.payment_status,
      ownerReference: session.metadata.owner_reference,
      sessionId: session.id,
      sessionStatus: session.status,
    };
  }

  async retrieveCheckoutSession(
    sessionId: string,
  ): Promise<CreatedStripeCheckout> {
    const session =
      await this.providerClient().checkout.sessions.retrieve(sessionId);
    const paymentIntentId = providerObjectId(session.payment_intent);
    if (
      session.livemode ||
      !session.currency ||
      session.amount_total === null ||
      session.expires_at <= 0 ||
      !session.status
    ) {
      throw new ServiceUnavailableException(PAYMENT_UNAVAILABLE);
    }
    return {
      amountTotal: session.amount_total,
      attemptId: session.metadata?.payment_attempt_id ?? null,
      checkoutUrl: session.url,
      currency: session.currency,
      expiresAt: new Date(session.expires_at * 1_000),
      paymentIntentId,
      paymentStatus: session.payment_status,
      ownerReference: session.metadata?.owner_reference ?? null,
      sessionId: session.id,
      sessionStatus: session.status,
    };
  }

  async capturePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.providerClient().paymentIntents.capture(
      paymentIntentId,
      {},
      { idempotencyKey: `o2p-capture-${paymentIntentId}` },
    );
  }

  async cancelPaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.providerClient().paymentIntents.cancel(
      paymentIntentId,
      { cancellation_reason: 'abandoned' },
      { idempotencyKey: `o2p-cancel-${paymentIntentId}` },
    );
  }

  async retrievePaymentIntent(
    paymentIntentId: string,
  ): Promise<Stripe.PaymentIntent> {
    return this.providerClient().paymentIntents.retrieve(paymentIntentId);
  }

  private providerClient(): Stripe {
    if (!this.stripe) {
      this.stripe = new Stripe(
        this.config.getOrThrow<string>('STRIPE_SANDBOX_SECRET_KEY'),
        {
          apiVersion: '2026-07-29.dahlia',
          maxNetworkRetries: 0,
          timeout: this.config.getOrThrow<number>('STRIPE_API_TIMEOUT_MS'),
        },
      );
    }
    return this.stripe;
  }
}

function integrationIdentifier(attemptId: string): string {
  const bytes = createHash('sha256').update(attemptId, 'ascii').digest();
  let suffix = '';
  for (let index = 0; index < 8; index += 1) {
    suffix += String.fromCharCode(97 + (bytes[index] % 26));
  }
  return `hop-barley-o2p-${suffix}`;
}

function providerObjectId(
  object: string | Readonly<{ id: string }> | null,
): string | null {
  return typeof object === 'string' ? object : (object?.id ?? null);
}
