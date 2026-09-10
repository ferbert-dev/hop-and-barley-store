import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type Stripe from 'stripe';
import { StripeGatewayService } from './stripe-gateway.service';

const ATTEMPT = {
  currency: 'EUR',
  discountMinor: 600,
  email: 'buyer@example.test',
  id: '11111111-1111-4111-8111-111111111111',
  itemCount: 2,
  itemSubtotalMinor: 10_000,
  ownerReference: 'user:22222222-2222-4222-8222-222222222222',
  shippingMinor: 500,
  totalMinor: 9_900,
} as const;

function configuredGateway(enabled = true) {
  return new StripeGatewayService(
    new ConfigService({
      STRIPE_API_TIMEOUT_MS: 10_000,
      STRIPE_CHECKOUT_CANCEL_URL: 'http://localhost:3000/checkout/cancel',
      STRIPE_CHECKOUT_SUCCESS_URL: 'http://localhost:3000/checkout/success',
      STRIPE_PAYMENT_METHOD_CONFIGURATION_ID: 'pmc_cardonly123',
      STRIPE_PAYMENTS_ENABLED: enabled,
      STRIPE_SANDBOX_SECRET_KEY: 'sk_test_1234567890123456',
      STRIPE_SANDBOX_WEBHOOK_SECRET: 'whsec_1234567890123456',
    }),
  );
}

describe('StripeGatewayService', () => {
  it('creates deterministic manual-capture card-only Checkout parameters', async () => {
    const gateway = configuredGateway();
    const create = jest.fn().mockResolvedValue({
      amount_total: 9_900,
      client_reference_id: ATTEMPT.id,
      currency: 'eur',
      expires_at: 1_789_000_000,
      id: 'cs_test_session',
      livemode: false,
      metadata: {
        environment: 'sandbox',
        owner_reference: ATTEMPT.ownerReference,
        payment_attempt_id: ATTEMPT.id,
      },
      payment_status: 'unpaid',
      payment_intent: null,
      status: 'open',
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });
    Reflect.set(gateway, 'stripe', { checkout: { sessions: { create } } });
    const quotedAt = new Date('2026-09-10T12:00:00.000Z');

    await expect(
      gateway.createCheckoutSession(ATTEMPT, quotedAt),
    ).resolves.toMatchObject({
      paymentIntentId: null,
      sessionId: 'cs_test_session',
    });

    expect(create).toHaveBeenCalledTimes(1);
    const [params, options] = create.mock.calls[0] as [
      Stripe.Checkout.SessionCreateParams,
      Stripe.RequestOptions,
    ];
    expect(params).toMatchObject({
      automatic_tax: { enabled: false },
      client_reference_id: ATTEMPT.id,
      customer_email: ATTEMPT.email,
      expires_at: Math.floor(quotedAt.getTime() / 1_000) + 31 * 60,
      metadata: {
        environment: 'sandbox',
        owner_reference: ATTEMPT.ownerReference,
        payment_attempt_id: ATTEMPT.id,
      },
      mode: 'payment',
      payment_intent_data: {
        capture_method: 'manual',
        metadata: {
          environment: 'sandbox',
          owner_reference: ATTEMPT.ownerReference,
          payment_attempt_id: ATTEMPT.id,
        },
      },
      payment_method_configuration: 'pmc_cardonly123',
    });
    expect(params).not.toHaveProperty('payment_method_types');
    expect(params.line_items?.[0]?.quantity).toBe(1);
    expect(params.line_items?.[0]?.price_data?.unit_amount).toBe(9_400);
    expect(params.line_items?.[1]?.quantity).toBe(1);
    expect(params.line_items?.[1]?.price_data?.unit_amount).toBe(500);
    expect(params.integration_identifier).toMatch(/^hop-barley-o2p-[a-z]{8}$/);
    expect(options).toEqual({ idempotencyKey: `o2p-session-${ATTEMPT.id}` });
  });

  it('fails closed for new starts while provider reads remain available', async () => {
    const gateway = configuredGateway(false);
    const retrieve = jest.fn().mockResolvedValue({
      amount_total: 9_900,
      client_reference_id: ATTEMPT.id,
      currency: 'eur',
      expires_at: 1_789_000_000,
      id: 'cs_test_session',
      livemode: false,
      metadata: {
        environment: 'sandbox',
        owner_reference: ATTEMPT.ownerReference,
        payment_attempt_id: ATTEMPT.id,
      },
      payment_status: 'unpaid',
      payment_intent: 'pi_test_payment',
      status: 'open',
      url: 'https://checkout.stripe.com/c/pay/cs_test_session',
    });
    Reflect.set(gateway, 'stripe', {
      checkout: { sessions: { retrieve } },
    });

    await expect(
      gateway.createCheckoutSession(ATTEMPT, new Date()),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(
      gateway.retrieveCheckoutSession('cs_test_session'),
    ).resolves.toMatchObject({ paymentIntentId: 'pi_test_payment' });
  });
});
