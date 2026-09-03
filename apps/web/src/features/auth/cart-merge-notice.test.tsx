import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CartMergeNotice } from './cart-merge-notice';

describe('CartMergeNotice', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    window.sessionStorage.clear();
  });

  it('stays absent when login did not report a merge problem', () => {
    render(<CartMergeNotice />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a generic recoverable warning after login merge failure', async () => {
    window.sessionStorage.setItem('hb-cart-merge-warning', '1');
    render(<CartMergeNotice />);

    await waitFor(() => expect(screen.getByRole('alert')).toBeVisible());
    expect(screen.getByRole('alert')).toHaveTextContent(
      'You are signed in, but your guest cart could not be merged.',
    );
    expect(
      screen.getByRole('button', { name: 'Retry cart merge' }),
    ).toBeEnabled();
  });

  it('retries through the generated contract with bounded request signals', async () => {
    const user = userEvent.setup();
    const fetch = vi
      .fn<(request: Request) => Promise<Response>>()
      .mockResolvedValueOnce(jsonResponse({ csrfToken: 'csrf-token' }))
      .mockResolvedValueOnce(jsonResponse({ cartMerge: 'succeeded' }));
    vi.stubGlobal('fetch', fetch);
    window.sessionStorage.setItem('hb-cart-merge-warning', '1');
    render(<CartMergeNotice />);

    await user.click(
      await screen.findByRole('button', { name: 'Retry cart merge' }),
    );

    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    const [csrfRequest] = fetch.mock.calls[0]!;
    const [mergeRequest] = fetch.mock.calls[1]!;
    expect(csrfRequest.url).toBe('http://localhost:3001/api/v1/auth/csrf');
    expect(mergeRequest.url).toBe(
      'http://localhost:3001/api/v1/auth/cart-merge',
    );
    expect(csrfRequest.signal).toBeInstanceOf(AbortSignal);
    expect(mergeRequest.signal).toBeInstanceOf(AbortSignal);
    expect(mergeRequest.headers.get('x-csrf-token')).toBe('csrf-token');
    expect(window.sessionStorage.getItem('hb-cart-merge-warning')).toBeNull();
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { 'content-type': 'application/json' },
    status: 200,
  });
}
