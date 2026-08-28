import { notFound, redirect } from 'next/navigation';
import type { ReactNode } from 'react';

import { readAdminCapability } from '../../features/admin/admin-capability';

export const dynamic = 'force-dynamic';

type AdminLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const capability = await readAdminCapability();

  if (capability.kind === 'anonymous') {
    redirect('/login?next=%2Fadmin%2Fproducts');
  }
  if (capability.kind !== 'authorized') notFound();

  return children;
}
