import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckoutScreen } from './checkout-screen';

const privateHeaders = { 'cache-control': 'private, no-store' };
const response = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: privateHeaders, status });

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
    expect(
      window.sessionStorage.getItem('hb-checkout-draft-handoff-v1'),
    ).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Sign in' }));
    expect(
      window.sessionStorage.getItem('hb-checkout-draft-handoff-v1'),
    ).toContain('stripe_debit_card');
    expect(
      screen.queryByRole('button', { name: 'Pay' }),
    ).not.toBeInTheDocument();
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
  });

  it('adopts an unchanged session-only handoff draft after an auth ownership transition', async () => {
    const csrfToken = `v1.${'A'.repeat(43)}`;
    const handoff = {
      delivery: { city: 'Berlin', countryCode: 'DE', street: 'Hopfenstraße' },
      email: 'brewer@example.com',
      fullName: 'Alex Brewer',
      paymentMethod: 'stripe_debit_card',
      phoneNumber: '+4912345678',
    };
    window.sessionStorage.setItem(
      'hb-checkout-draft-handoff-v1',
      JSON.stringify(handoff),
    );
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
    expect(
      window.sessionStorage.getItem('hb-checkout-draft-handoff-v1'),
    ).toBeNull();
  });
});
