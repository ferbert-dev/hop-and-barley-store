import type { PrismaService } from '../database/prisma.service';
import type { PaymentAttemptService } from './payment-attempt.service';
import type { StripeGatewayService } from './stripe-gateway.service';
import { StripePaymentService } from './stripe-payment.service';

jest.mock('../database/prisma.service', () => ({
  PrismaService: class PrismaService {},
}));
jest.mock('./payment-attempt.service', () => ({
  markPaymentAttemptSucceeded: jest.fn(),
  PaymentAttemptService: class PaymentAttemptService {},
  releasePaymentAttemptDefinitiveOutcome: jest.fn(),
}));
jest.mock('./stripe-gateway.service', () => ({
  StripeGatewayService: class StripeGatewayService {},
}));

describe('StripePaymentService checkout start boundary', () => {
  it('reports a definitive disabled start before creating an attempt', async () => {
    const attempts = { prepare: jest.fn() };
    const stripe = { enabled: jest.fn().mockReturnValue(false) };
    const service = new StripePaymentService(
      {} as PrismaService,
      attempts as unknown as PaymentAttemptService,
      stripe as unknown as StripeGatewayService,
    );

    await expect(
      service.startCheckout({
        cart: {
          cartId: '10000000-0000-4000-8000-000000000001',
          expiresAt: new Date('2027-01-01T00:00:00.000Z'),
          kind: 'guest',
          rawToken: 'guest-cart-capability',
        },
        checkoutDraftId: '20000000-0000-4000-8000-000000000001',
        idempotencyKey: '30000000-0000-4000-8000-000000000001',
        rawGuestCapability: 'guest-capability',
      }),
    ).rejects.toMatchObject({
      response: { status: 'payments-disabled' },
      status: 503,
    });
    expect(attempts.prepare).not.toHaveBeenCalled();
  });
});
