import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { readAdminCapability } from '../../features/admin/admin-capability';

export const dynamic = 'force-dynamic';

type AdminLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default async function AdminLayout({ children }: AdminLayoutProps) {
  const capability = await readAdminCapability();

  // Each leaf route owns its exact safe `next` destination. Allowing an
  // anonymous request to reach the leaf avoids redirecting `/admin/add` to the
  // product list while the parent boundary still denies every non-anonymous
  // capability failure neutrally.
  if (capability.kind === 'denied') notFound();

  return children;
}
