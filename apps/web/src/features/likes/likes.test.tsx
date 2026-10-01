import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { LikesProvider } from './likes-context';
import { LikesSticker } from './likes-sticker';
import type { LikesTransport } from './likes-transport';
import { PurchaseLikeCta } from './purchase-like-cta';

let pathname = '/';

vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
}));

function renderLikes(transport: LikesTransport) {
  return render(
    <LikesProvider transport={transport}>
      <PurchaseLikeCta paymentAttemptId="40000000-0000-4000-8000-000000000001" />
      <LikesSticker />
    </LikesProvider>,
  );
}

describe('purchase likes', () => {
  beforeEach(() => {
    pathname = '/';
  });

  it('shows the public aggregate and updates it only after a manual successful Like', async () => {
    const transport: LikesTransport = {
      count: vi.fn().mockResolvedValue({ count: 12 }),
      create: vi.fn().mockResolvedValue({ count: 13 }),
    };
    const user = userEvent.setup();
    renderLikes(transport);

    await expect(
      screen.findByLabelText('12 likes'),
    ).resolves.toBeInTheDocument();
    expect(transport.create).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Like this shop' }));

    await waitFor(() =>
      expect(transport.create).toHaveBeenCalledWith(
        '40000000-0000-4000-8000-000000000001',
      ),
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Like sent — thank you.',
    );
    expect(screen.getByLabelText('13 likes')).toBeInTheDocument();
  });

  it('keeps the aggregate unchanged and offers a retry after a failed Like', async () => {
    const transport: LikesTransport = {
      count: vi.fn().mockResolvedValue({ count: 12 }),
      create: vi
        .fn()
        .mockRejectedValueOnce(new Error('unavailable'))
        .mockResolvedValueOnce({ count: 13 }),
    };
    const user = userEvent.setup();
    renderLikes(transport);

    await screen.findByLabelText('12 likes');
    await user.click(screen.getByRole('button', { name: 'Like this shop' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'We couldn’t send your like.',
    );
    expect(screen.getByLabelText('12 likes')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Try leaving your like again' }),
    );
    await screen.findByText('Like sent — thank you.');
    expect(screen.getByLabelText('13 likes')).toBeInTheDocument();
  });

  it('hides the sticker, but not its shared state, from admin routes', async () => {
    pathname = '/admin/products';
    const transport: LikesTransport = {
      count: vi.fn().mockResolvedValue({ count: 12 }),
      create: vi.fn(),
    };
    renderLikes(transport);

    await waitFor(() => expect(transport.count).toHaveBeenCalledOnce());
    expect(
      screen.queryByRole('complementary', { name: 'Community likes' }),
    ).not.toBeInTheDocument();
  });
});
