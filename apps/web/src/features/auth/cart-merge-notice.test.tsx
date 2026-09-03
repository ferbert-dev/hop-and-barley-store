import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { CartMergeNotice } from './cart-merge-notice';

describe('CartMergeNotice', () => {
  beforeEach(() => window.sessionStorage.clear());

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
});
