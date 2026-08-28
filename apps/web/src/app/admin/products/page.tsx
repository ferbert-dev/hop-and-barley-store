import type { Metadata } from 'next';

import { AdminShell } from '../../../features/admin/admin-shell';

export const metadata: Metadata = { title: 'Product Management' };

export default function AdminProductsPage() {
  return <AdminShell />;
}
