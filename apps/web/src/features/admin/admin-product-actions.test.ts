import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  readAdminCapability: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('./admin-capability', () => ({
  readAdminCapability: mocks.readAdminCapability,
}));

import { revalidateProductViews } from './admin-product-actions';

describe('revalidateProductViews', () => {
  beforeEach(() => vi.clearAllMocks());

  it('revalidates product views for an authorized administrator', async () => {
    mocks.readAdminCapability.mockResolvedValue({ kind: 'authorized' });

    await revalidateProductViews();

    expect(mocks.revalidatePath.mock.calls).toEqual([
      ['/'],
      ['/product/[slug]', 'page'],
      ['/admin/products'],
    ]);
  });

  it('rejects revalidation without administrator authorization', async () => {
    mocks.readAdminCapability.mockResolvedValue({ kind: 'denied' });

    await expect(revalidateProductViews()).rejects.toThrow(
      'Admin authorization required',
    );
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
