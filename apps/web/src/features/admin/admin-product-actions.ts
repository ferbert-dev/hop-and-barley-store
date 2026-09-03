'use server';

import { revalidatePath } from 'next/cache';
import { readAdminCapability } from './admin-capability';

export async function revalidateProductViews(): Promise<void> {
  const capability = await readAdminCapability();
  if (capability.kind !== 'authorized') {
    throw new Error('Admin authorization required');
  }
  revalidatePath('/');
  revalidatePath('/product/[slug]', 'page');
  revalidatePath('/admin/products');
}
