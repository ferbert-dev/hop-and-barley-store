import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CHECKOUT_HANDOFF_KEY, storeCheckoutHandoff } from './checkout-handoff';
import { PAYMENT_HANDOFF_KEY } from './checkout-payment';
import { CheckoutScreen } from './checkout-screen';

const privateHeaders = { 'cache-control': 'private, no-store' };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(withQuote(body)), {
    headers: privateHeaders,
    status,
  });

afterEach(() => vi.unstubAllGlobals());
beforeEach(() => window.sessionStorage.clear());

describe('CheckoutScreen', () => {
  it('offers guest checkout, preserves the checkout return target, and does not expose a pay action', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(undefined, 404)),
    );
    const user = userEvent.setup();
    render(<CheckoutScreen />);

    await screen.findByRole('link', { name: 'Sign in' });
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute(
      'href',
      '/login?next=%2Fcheckout',
    );
    expect(
      screen.getByRole('link', { name: 'create an account' }),
    ).toHaveAttribute('href', '/register?next=%2Fcheckout');
    expect(screen.getByLabelText('Debit Card')).toBeChecked();
    expect(window.sessionStorage.getItem(CHECKOUT_HANDOFF_KEY)).toBeNull();
    await waitFor(() =>
      expect(screen.getByLabelText('Full Name')).toBeEnabled(),
    );
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(window.sessionStorage.getItem(CHECKOUT_HANDOFF_KEY)).not.toContain(
      'stripe_debit_card',
    );
    expect(
      screen.queryByRole('button', { name: 'Pay' }),
    ).not.toBeInTheDocument();
  });

  it('updates postal validation when switching EU countries without blocking other destinations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(undefined, 404)),
    );
    const user = userEvent.setup();
    render(<CheckoutScreen />);
    await screen.findByRole('heading', { name: 'Checkout' });
    await waitFor(() =>
      expect(screen.getByLabelText('Postal code')).toBeEnabled(),
    );
    const country = screen.getByLabelText('Country');
    expect(screen.getByRole('option', { name: 'Spain' })).toHaveValue('ES');
    expect(screen.getAllByRole('option')).toHaveLength(250);
    const postal = screen.getByLabelText('Postal code') as HTMLInputElement;
    for (const [code, valid, invalid] of [
      ['ES', '08001', 'ABCDE'],
      ['NL', '1012 AB', '1012'],
    ]) {
      await user.selectOptions(country, code);
      await user.clear(postal);
      await user.type(postal, invalid);
      expect(postal.checkValidity()).toBe(false);
      await user.clear(postal);
      await user.type(postal, valid);
      expect(postal.checkValidity()).toBe(true);
      expect(postal).toBeRequired();
    }
    for (const code of ['IE', 'AE', 'GB', 'CH', 'NO']) {
      await user.selectOptions(country, code);
      await user.clear(postal);
      expect(postal).not.toBeRequired();
      expect(postal.checkValidity()).toBe(true);
    }
  });

  it('loads and saves a structured private draft without a payment call', async () => {
    const csrfToken = `v1.${'A'.repeat(43)}`;
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(undefined, 404))
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockResolvedValueOnce(
        response({
          delivery: {
            additionalInfo: null,
            administrativeArea: null,
            apartmentUnit: null,
            city: 'Berlin',
            countryCode: 'DE',
            floor: null,
            houseNumber: null,
            postalCode: '10115',
            street: 'Hopfenstraße',
          },
          email: 'brewer@example.com',
          expiresAt: '2026-09-10T10:00:00.000Z',
          fullName: 'Alex Brewer',
          paymentMethod: 'stripe_debit_card',
          phoneNumber: '+4912345678',
          status: 'pre_payment',
          updatedAt: '2026-09-09T10:00:00.000Z',
        }),
      );
    vi.stubGlobal('fetch', fetch);
    const user = userEvent.setup();
    render(<CheckoutScreen />);
    await screen.findByRole('heading', { name: 'Checkout' });
    await waitFor(() =>
      expect(screen.getByLabelText('Full Name')).toBeEnabled(),
    );

    await user.type(screen.getByLabelText('Full Name'), 'Alex Brewer');
    await user.type(screen.getByLabelText('Email'), 'brewer@example.com');
    await user.type(screen.getByLabelText('Phone number'), '+4912345678');
    await user.type(screen.getByLabelText('Street'), 'Hopfenstraße');
    await user.type(screen.getByLabelText('City'), 'Berlin');
    await user.type(screen.getByLabelText('Postal code'), '10115');
    await user.click(
      screen.getByRole('button', { name: 'Save checkout details' }),
    );

    await waitFor(() =>
      expect(
        screen.getByText('Checkout details saved privately.'),
      ).toBeVisible(),
    );
    const request = fetch.mock.calls[2]?.[0] as Request;
    expect(request.url).toBe('http://localhost:3001/api/v1/checkout/draft');
    expect(request.headers.get('idempotency-key')).toMatch(/^checkout-/u);
    expect(request.url).not.toContain('stripe');
    expect(screen.getByText('Products')).toBeVisible();
    expect(screen.getByText('€5.99')).toBeVisible();
    expect(screen.getByText('€5.00')).toBeVisible();
    expect(screen.getByText('€10.99')).toBeVisible();
  });

  it('locks draft edits, saves, and auth handoff while the exact saved payment attempt is unsettled', async () => {
    const attemptId = '40000000-0000-4000-8000-000000000001';
    window.sessionStorage.setItem(
      PAYMENT_HANDOFF_KEY,
      JSON.stringify({
        attemptId,
        draftId: '30000000-0000-4000-8000-000000000001',
        key: '50000000-0000-4000-8000-000000000001',
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            delivery: {
              city: 'Berlin',
              countryCode: 'DE',
              street: 'Hopfenstraße',
            },
            email: 'brewer@example.com',
            expiresAt: null,
            fullName: 'Alex Brewer',
            paymentMethod: 'stripe_debit_card',
            phoneNumber: '+4912345678',
            status: 'pre_payment',
            updatedAt: '2026-09-10T10:00:00.000Z',
          }),
        )
        .mockResolvedValueOnce(response({ attemptId, status: 'processing' })),
    );
    const user = userEvent.setup();
    render(<CheckoutScreen />);

    expect(await screen.findByText(/being confirmed/)).toBeVisible();
    expect(screen.getByLabelText('Full Name')).toBeDisabled();
    expect(
      screen.getByRole('button', { name: 'Save checkout details' }),
    ).toBeDisabled();
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(window.sessionStorage.getItem(CHECKOUT_HANDOFF_KEY)).toBeNull();
  });

  it('unlocks draft edits only after the exact saved payment attempt is terminal', async () => {
    const attemptId = '40000000-0000-4000-8000-000000000001';
    window.sessionStorage.setItem(
      PAYMENT_HANDOFF_KEY,
      JSON.stringify({
        attemptId,
        draftId: '30000000-0000-4000-8000-000000000001',
        key: '50000000-0000-4000-8000-000000000001',
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          response({
            delivery: {
              city: 'Berlin',
              countryCode: 'DE',
              street: 'Hopfenstraße',
            },
            email: 'brewer@example.com',
            expiresAt: null,
            fullName: 'Alex Brewer',
            paymentMethod: 'stripe_debit_card',
            phoneNumber: '+4912345678',
            status: 'pre_payment',
            updatedAt: '2026-09-10T10:00:00.000Z',
          }),
        )
        .mockResolvedValueOnce(response({ attemptId, status: 'failed' })),
    );
    render(<CheckoutScreen />);

    expect(await screen.findByText(/not completed/)).toBeVisible();
    await waitFor(() => {
      expect(screen.getByLabelText('Full Name')).toBeEnabled();
      expect(
        screen.getByRole('button', { name: 'Save checkout details' }),
      ).toBeEnabled();
    });
  });

  it('hides editable checkout details and save prompts only after the correlated payment succeeds', async () => {
    const attemptId = '40000000-0000-4000-8000-000000000001';
    window.sessionStorage.setItem(
      PAYMENT_HANDOFF_KEY,
      JSON.stringify({
        attemptId,
        draftId: '30000000-0000-4000-8000-000000000001',
        key: '50000000-0000-4000-8000-000000000001',
      }),
    );
    vi.stubGlobal(
      'fetch',
      vi.fn(async (request: Request) => {
        if (request.url.endsWith('/api/v1/payments/stripe/status'))
          return response({ attemptId, status: 'succeeded' });
        return response(undefined, 404);
      }),
    );

    render(<CheckoutScreen />);

    expect(
      await screen.findByRole('heading', { name: 'Payment successful' }),
    ).toBeVisible();
    expect(
      screen.getByText(
        'Your payment has been received. Thank you for your order.',
      ),
    ).toBeVisible();
    await waitFor(() => {
      expect(screen.queryByLabelText('Full Name')).toBeNull();
      expect(
        screen.queryByText(
          'Save your delivery details, then continue to secure payment.',
        ),
      ).toBeNull();
      expect(
        screen.queryByRole('button', { name: 'Save checkout details' }),
      ).toBeNull();
      expect(
        screen.queryByText(
          'Save your checkout details to receive the current order quote.',
        ),
      ).toBeNull();
    });
    expect(
      screen.getByRole('link', { name: 'Continue shopping' }),
    ).toHaveAttribute('href', '/');
  });

  it('adopts an unchanged session-only handoff draft after an auth ownership transition', async () => {
    const csrfToken = `v1.${'A'.repeat(43)}`;
    const handoff = {
      delivery: { city: 'Berlin', countryCode: 'DE', street: 'Hopfenstraße' },
      email: 'brewer@example.com',
      fullName: 'Alex Brewer',
      paymentMethod: 'stripe_debit_card' as const,
      phoneNumber: '+4912345678',
    };
    storeCheckoutHandoff(window.sessionStorage, handoff, null);
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(response(undefined, 401))
      .mockResolvedValueOnce(response({ csrfToken }))
      .mockResolvedValueOnce(
        response({
          ...handoff,
          delivery: {
            ...handoff.delivery,
            additionalInfo: null,
            administrativeArea: null,
            apartmentUnit: null,
            floor: null,
            houseNumber: null,
            postalCode: null,
          },
          expiresAt: null,
          status: 'pre_payment',
          updatedAt: '2026-09-09T10:00:00.000Z',
        }),
      );
    vi.stubGlobal('fetch', fetch);

    render(<CheckoutScreen />);

    await screen.findByRole('link', { name: 'Sign in' });
    const adoptionRequest = fetch.mock.calls[2]?.[0] as Request;
    expect(adoptionRequest.url).toBe(
      'http://localhost:3001/api/v1/checkout/draft',
    );
    await expect(adoptionRequest.clone().json()).resolves.toEqual(handoff);
    expect(window.sessionStorage.getItem(CHECKOUT_HANDOFF_KEY)).toBeNull();
  });

  it('clears a valid handoff if the ownership adoption save fails', async () => {
    const handoff = {
      delivery: { city: 'Berlin', countryCode: 'DE', street: 'Hopfenstraße' },
      email: 'brewer@example.com',
      fullName: 'Alex Brewer',
      paymentMethod: 'stripe_debit_card' as const,
      phoneNumber: '+4912345678',
    };
    storeCheckoutHandoff(window.sessionStorage, handoff, null);
    const csrfToken = `v1.${'A'.repeat(43)}`;
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(undefined, 401))
        .mockResolvedValueOnce(response({ csrfToken }))
        .mockResolvedValueOnce(response(undefined, 503)),
    );

    render(<CheckoutScreen />);

    await screen.findByRole('link', { name: 'Sign in' });
    expect(window.sessionStorage.getItem(CHECKOUT_HANDOFF_KEY)).toBeNull();
  });

  it('clears an adopted handoff even if the checkout unmounts before the save resolves', async () => {
    const handoff = {
      delivery: { city: 'Berlin', countryCode: 'DE', street: 'Hopfenstraße' },
      email: 'previous@example.com',
      fullName: 'Previous Customer',
      paymentMethod: 'stripe_debit_card' as const,
      phoneNumber: '+4912345678',
    };
    storeCheckoutHandoff(window.sessionStorage, handoff, null);
    const csrfToken = `v1.${'A'.repeat(43)}`;
    let resolveAdoption!: (value: Response) => void;
    const adoption = new Promise<Response>((resolve) => {
      resolveAdoption = resolve;
    });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(response(undefined, 401))
        .mockResolvedValueOnce(response({ csrfToken }))
        .mockReturnValueOnce(adoption),
    );

    const checkout = render(<CheckoutScreen />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
    checkout.unmount();
    resolveAdoption(response({ ...handoff, status: 'pre_payment' }));

    await waitFor(() =>
      expect(window.sessionStorage.getItem(CHECKOUT_HANDOFF_KEY)).toBeNull(),
    );
  });

  it('clears a handoff if an existing draft loads after checkout unmounts', async () => {
    storeCheckoutHandoff(
      window.sessionStorage,
      {
        delivery: { city: 'Berlin', countryCode: 'DE', street: 'Old street' },
        email: 'previous@example.com',
        fullName: 'Previous Customer',
        paymentMethod: 'stripe_debit_card',
        phoneNumber: '+4912345678',
      },
      null,
    );
    let resolveDraft!: (value: Response) => void;
    const draft = new Promise<Response>((resolve) => {
      resolveDraft = resolve;
    });
    vi.stubGlobal('fetch', vi.fn().mockReturnValueOnce(draft));

    const checkout = render(<CheckoutScreen />);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
    checkout.unmount();
    resolveDraft(
      response({
        delivery: {
          city: 'Madrid',
          countryCode: 'ES',
          street: 'New street',
        },
        email: 'current@example.com',
        expiresAt: null,
        fullName: 'Current Customer',
        paymentMethod: 'stripe_debit_card',
        phoneNumber: '+34600123456',
        status: 'pre_payment',
        updatedAt: '2026-09-10T10:00:00.000Z',
      }),
    );

    await waitFor(() =>
      expect(window.sessionStorage.getItem(CHECKOUT_HANDOFF_KEY)).toBeNull(),
    );
  });

  it.each([
    ['empty', 'Your cart is empty. Return to cart to add items.'],
    [
      'unavailable',
      'We can’t quote this cart right now. Return to cart to review availability.',
    ],
  ] as const)(
    'renders the server %s quote state',
    async (quoteStatus, copy) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () =>
          response({
            currency: 'EUR',
            delivery: {
              additionalInfo: null,
              administrativeArea: null,
              apartmentUnit: null,
              city: 'Berlin',
              countryCode: 'DE',
              floor: null,
              houseNumber: null,
              postalCode: '10115',
              street: 'Hopfenstraße',
            },
            email: 'brewer@example.com',
            expiresAt: null,
            fullName: 'Alex Brewer',
            discountBasisPoints: 0,
            discountMinor: 0,
            discountPolicyVersion: 'no-discount-v1',
            itemSubtotalMinor: 0,
            paymentMethod: 'stripe_debit_card',
            phoneNumber: '+4912345678',
            quoteStatus,
            quotedAt: '2026-09-10T10:00:00.000Z',
            shippingMinor: 0,
            status: 'pre_payment',
            totalMinor: 0,
            updatedAt: '2026-09-10T10:00:00.000Z',
          }),
        ),
      );

      render(<CheckoutScreen />);

      expect(await screen.findByText(copy)).toBeVisible();
    },
  );

  it('prefills an editable checkout form from a populated authenticated profile only when no draft exists', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response(undefined, 404)),
    );
    render(<CheckoutScreen initialProfile={populatedProfile} />);

    await screen.findByText('Checkout with your account');
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeEnabled());
    expect(screen.queryByRole('link', { name: 'Sign in' })).toBeNull();
    expect(
      screen.queryByRole('link', { name: 'create an account' }),
    ).toBeNull();
    expect(screen.getByLabelText('Full Name')).toHaveValue('Alex Brewer');
    expect(screen.getByLabelText('Email')).toHaveValue('brewer@example.com');
    expect(screen.getByLabelText('Phone number')).toHaveValue('+4912345678');
    expect(screen.getByLabelText('Street')).toHaveValue('Hopfenstraße');
    expect(screen.getByLabelText('Postal code')).toHaveValue('10115');
    expect(screen.getByLabelText('Email')).toBeEnabled();
    expect(
      screen.getByText(
        'Secure Stripe card payment. No payment is taken on this page.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByText(/Guest checkout uses Stripe debit card/),
    ).toBeNull();
  });

  it('shows the server-owned first-purchase discount separately from shipping', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        response({
          delivery: {
            additionalInfo: null,
            administrativeArea: null,
            apartmentUnit: null,
            city: 'Berlin',
            countryCode: 'DE',
            floor: null,
            houseNumber: '4',
            postalCode: '10115',
            street: 'Hopfenstraße',
          },
          discountBasisPoints: 600,
          discountMinor: 600,
          discountPolicyVersion: 'registered-first-purchase-v1',
          email: 'brewer@example.com',
          expiresAt: null,
          fullName: 'Alex Brewer',
          itemSubtotalMinor: 10_000,
          paymentMethod: 'stripe_debit_card',
          phoneNumber: '+4912345678',
          status: 'pre_payment',
          totalMinor: 9_900,
          updatedAt: '2026-09-10T10:00:00.000Z',
        }),
      ),
    );
    render(<CheckoutScreen initialProfile={populatedProfile} />);

    expect(
      await screen.findByText('First purchase account discount (6%)'),
    ).toBeVisible();
    expect(screen.getByText('€100.00')).toBeVisible();
    expect(screen.getByText('€6.00')).toBeVisible();
    expect(screen.getByText('€5.00')).toBeVisible();
    expect(screen.getByText('€99.00')).toBeVisible();
  });

  it.each([
    ['Spain', 'ES'],
    [' es ', 'ES'],
    ['UK', 'GB'],
    ['ZZ', ''],
    ['Atlantis', ''],
  ])(
    'normalizes profile country %s to an editable checkout code',
    async (country, expectedCode) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response(undefined, 404)),
      );
      render(
        <CheckoutScreen
          initialProfile={{
            ...populatedProfile,
            primaryAddress: { ...populatedProfile.primaryAddress, country },
          }}
        />,
      );

      await screen.findByText('Checkout with your account');
      expect(screen.getByLabelText('Country')).toHaveValue(expectedCode);
      expect(fetch).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    [
      'partial',
      {
        ...populatedProfile,
        primaryAddress: null,
        profile: { avatar: null, fullName: 'Alex Brewer', phone: null },
      },
      '',
    ],
    ['absent', null, ''],
  ] as const)(
    'uses available fields and leaves missing fields editable for a %s profile',
    async (_state, initialProfile, expectedPhone) => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => response(undefined, 404)),
      );
      render(<CheckoutScreen initialProfile={initialProfile} />);

      if (initialProfile) {
        await screen.findByText('Checkout with your account');
      } else {
        await screen.findByRole('link', { name: 'Sign in' });
      }
      await waitFor(() =>
        expect(screen.getByLabelText('Street')).toBeEnabled(),
      );
      expect(screen.getByLabelText('Phone number')).toHaveValue(expectedPhone);
      expect(screen.getByLabelText('Street')).toHaveValue('');
      expect(screen.getByLabelText('Street')).toBeEnabled();
    },
  );
});

const populatedProfile = {
  email: 'brewer@example.com',
  primaryAddress: {
    additionalInfo: 'Use side door',
    apartmentUnit: '2B',
    city: 'Berlin',
    country: 'DE',
    floor: '2',
    houseNumber: '4',
    postalCode: '10115',
    street: 'Hopfenstraße',
  },
  profile: { avatar: null, fullName: 'Alex Brewer', phone: '+4912345678' },
  role: 'CUSTOMER' as const,
};

function withQuote(body: unknown) {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('status' in body) ||
    body.status !== 'pre_payment'
  ) {
    return body;
  }
  return {
    id: '30000000-0000-4000-8000-000000000001',
    currency: 'EUR',
    discountBasisPoints: 0,
    discountMinor: 0,
    discountPolicyVersion: 'no-discount-v1',
    itemSubtotalMinor: 599,
    quoteStatus: 'ready',
    quotedAt: '2026-09-10T10:00:00.000Z',
    shippingMinor: 500,
    totalMinor: 1099,
    ...body,
  };
}
