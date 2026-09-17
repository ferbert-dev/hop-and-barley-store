import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CheckoutPayment, PAYMENT_HANDOFF_KEY } from './checkout-payment';

const transport = vi.hoisted(() => ({
  start: vi.fn(),
  status: vi.fn(),
  reconcile: vi.fn(),
}));
vi.mock('./checkout-payment-transport', () => ({
  createBrowserCheckoutPaymentTransport: () => transport,
}));
const draftId = '30000000-0000-4000-8000-000000000001';
const attemptId = '40000000-0000-4000-8000-000000000001';
const key = '50000000-0000-4000-8000-000000000001';
function handoff() {
  window.sessionStorage.setItem(
    PAYMENT_HANDOFF_KEY,
    JSON.stringify({ draftId, attemptId, key }),
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/checkout');
});
afterEach(() => vi.useRealTimers());

describe('checkout payment', () => {
  it('requires a saved ready quote before starting payment', async () => {
    render(<CheckoutPayment canPay={false} draftId={null} />);
    expect(
      await screen.findByRole('button', { name: 'Pay with Stripe' }),
    ).toBeDisabled();
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('does not treat a return URL as proof of successful payment', async () => {
    window.history.replaceState(null, '', '/checkout?payment=return');
    render(<CheckoutPayment canPay draftId={draftId} />);
    expect(await screen.findByText(/cannot confirm/)).toBeInTheDocument();
    expect(screen.queryByText(/Payment confirmed/)).not.toBeInTheDocument();
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('only confirms the correlated attempt, including after a cancelled navigation', async () => {
    handoff();
    window.history.replaceState(null, '', '/checkout?payment=cancelled');
    transport.status.mockResolvedValue({ attemptId, status: 'succeeded' });
    render(<CheckoutPayment canPay={false} draftId={null} />);
    expect(
      await screen.findByRole('heading', { name: 'Payment successful' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Continue shopping' }),
    ).toHaveAttribute('href', '/');
  });

  it('reports a canonical correlated success to its mounted checkout screen', async () => {
    handoff();
    transport.status.mockResolvedValue({ attemptId, status: 'succeeded' });
    const onSucceededChange = vi.fn();

    render(
      <CheckoutPayment
        canPay={false}
        draftId={null}
        onSucceededChange={onSucceededChange}
      />,
    );

    await screen.findByRole('heading', { name: 'Payment successful' });
    expect(onSucceededChange).toHaveBeenLastCalledWith(true);
  });

  it('does not report success from an uncorrelated return URL', async () => {
    window.history.replaceState(null, '', '/checkout?payment=return');
    const onSucceededChange = vi.fn();

    render(
      <CheckoutPayment
        canPay
        draftId={draftId}
        onSucceededChange={onSucceededChange}
      />,
    );

    await screen.findByText(/cannot confirm/);
    expect(onSucceededChange).not.toHaveBeenCalledWith(true);
  });

  it('polls a correlated returned ready session through the full 30-second window until it succeeds', async () => {
    vi.useFakeTimers();
    handoff();
    window.history.replaceState(null, '', '/checkout?payment=return');
    transport.status
      .mockResolvedValueOnce({ attemptId, status: 'ready_for_redirect' })
      .mockResolvedValueOnce({ attemptId, status: 'ready_for_redirect' })
      .mockResolvedValueOnce({ attemptId, status: 'ready_for_redirect' })
      .mockResolvedValueOnce({ attemptId, status: 'ready_for_redirect' })
      .mockResolvedValueOnce({ attemptId, status: 'ready_for_redirect' })
      .mockResolvedValueOnce({ attemptId, status: 'ready_for_redirect' })
      .mockResolvedValueOnce({ attemptId, status: 'ready_for_redirect' })
      .mockResolvedValueOnce({ attemptId, status: 'ready_for_redirect' })
      .mockResolvedValueOnce({ attemptId, status: 'ready_for_redirect' })
      .mockResolvedValueOnce({ attemptId, status: 'ready_for_redirect' })
      .mockResolvedValueOnce({ attemptId, status: 'succeeded' });

    render(<CheckoutPayment canPay={false} draftId={null} />);
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(30_000));

    expect(transport.status).toHaveBeenCalledTimes(11);
    expect(
      screen.getByRole('heading', { name: 'Payment successful' }),
    ).toBeInTheDocument();
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('keeps a returned ready session safely pending after the full window and reconciles without starting another payment', async () => {
    vi.useFakeTimers();
    handoff();
    window.history.replaceState(null, '', '/checkout?payment=return');
    transport.status.mockResolvedValue({
      attemptId,
      status: 'ready_for_redirect',
    });
    transport.reconcile.mockResolvedValue({
      attemptId,
      status: 'ready_for_redirect',
    });
    render(<CheckoutPayment canPay={false} draftId={null} />);
    await act(async () => {});
    await act(async () => vi.advanceTimersByTimeAsync(30_000));

    expect(transport.status).toHaveBeenCalledTimes(11);
    expect(screen.getByText(/still being confirmed/)).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Continue existing payment' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Check payment status' }),
    );
    await act(async () => {});
    expect(transport.reconcile).toHaveBeenCalledTimes(1);
    expect(transport.start).not.toHaveBeenCalled();
  });

  it('keeps normal ready-for-redirect recovery available before a payment return', async () => {
    handoff();
    transport.status.mockResolvedValue({
      attemptId,
      status: 'ready_for_redirect',
    });
    transport.start.mockRejectedValue(new Error('resume unavailable'));
    const user = userEvent.setup();
    render(<CheckoutPayment canPay={false} draftId={null} />);

    await screen.findByText(/secure payment is ready/);
    await user.click(
      screen.getByRole('button', { name: 'Continue existing payment' }),
    );
    expect(transport.start).toHaveBeenCalledWith(draftId, key);
  });

  it('clears only the completed payment handoff when the customer continues shopping', async () => {
    handoff();
    window.sessionStorage.setItem('unrelated-cart-state', 'keep');
    transport.status.mockResolvedValue({ attemptId, status: 'succeeded' });
    const user = userEvent.setup();
    render(<CheckoutPayment canPay={false} draftId={null} />);

    await user.click(
      await screen.findByRole('link', { name: 'Continue shopping' }),
    );
    expect(window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY)).toBeNull();
    expect(window.sessionStorage.getItem('unrelated-cart-state')).toBe('keep');
  });

  it('rejects another historical order returned by the account status endpoint', async () => {
    handoff();
    transport.status.mockResolvedValue({
      attemptId: draftId,
      status: 'succeeded',
    });
    render(<CheckoutPayment canPay draftId={draftId} />);
    expect(await screen.findByText(/cannot confirm/)).toBeInTheDocument();
    expect(screen.queryByText(/Payment confirmed/)).not.toBeInTheDocument();
  });

  it('persists the key before starting and reuses it after an ambiguous failure', async () => {
    transport.start.mockRejectedValue(new Error('timeout'));
    const user = userEvent.setup();
    render(<CheckoutPayment canPay draftId={draftId} />);
    await user.click(
      await screen.findByRole('button', { name: 'Pay with Stripe' }),
    );
    await screen.findByText(/cannot confirm/);
    const saved = JSON.parse(
      window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY)!,
    );
    expect(transport.start).toHaveBeenCalledWith(draftId, saved.key);
    await user.click(
      screen.getByRole('button', { name: 'Continue existing payment' }),
    );
    await waitFor(() => expect(transport.start).toHaveBeenCalledTimes(2));
    expect(transport.start.mock.calls[1]).toEqual(
      transport.start.mock.calls[0],
    );
  });

  it('issues only one start while a duplicate click is unresolved', async () => {
    let resolveStart!: (value: {
      attemptId: string;
      checkoutUrl: string;
    }) => void;
    transport.start.mockReturnValue(
      new Promise((resolve) => {
        resolveStart = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<CheckoutPayment canPay draftId={draftId} />);

    const pay = await screen.findByRole('button', { name: 'Pay with Stripe' });
    await user.click(pay);
    await user.click(pay);
    expect(transport.start).toHaveBeenCalledTimes(1);
    resolveStart({
      attemptId,
      checkoutUrl: 'https://checkout.stripe.com/c/pay/cs_test_safe',
    });
  });

  it('keeps the same idempotency key when an unknown attempt is resumed after remount', async () => {
    transport.start.mockRejectedValue(new Error('timeout'));
    transport.status.mockResolvedValue(null);
    const user = userEvent.setup();
    const payment = render(<CheckoutPayment canPay draftId={draftId} />);
    await user.click(
      await screen.findByRole('button', { name: 'Pay with Stripe' }),
    );
    await screen.findByText(/cannot confirm/);
    const firstKey = JSON.parse(
      window.sessionStorage.getItem(PAYMENT_HANDOFF_KEY)!,
    ).key;
    payment.unmount();

    render(<CheckoutPayment canPay draftId={draftId} />);
    await user.click(
      await screen.findByRole('button', { name: 'Continue existing payment' }),
    );
    await waitFor(() => expect(transport.start).toHaveBeenCalledTimes(2));
    expect(transport.start.mock.calls[1]).toEqual([draftId, firstKey]);
  });

  it('keeps processing distinct from failure and reconciles without a new charge', async () => {
    handoff();
    transport.status.mockResolvedValue({ attemptId, status: 'processing' });
    transport.reconcile.mockResolvedValue({ attemptId, status: 'succeeded' });
    const user = userEvent.setup();
    render(<CheckoutPayment canPay draftId={draftId} />);
    await screen.findByText(/being confirmed/);
    await user.click(
      screen.getByRole('button', { name: 'Check payment status' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Payment successful' }),
    ).toBeInTheDocument();
    expect(transport.start).not.toHaveBeenCalled();
  });
});
