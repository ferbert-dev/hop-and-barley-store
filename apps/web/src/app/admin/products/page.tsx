import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { Button } from '../../../components/ui/button';
import { ErrorState } from '../../../components/ui/status';
import { selectSessionCookieHeader } from '../../../features/auth/auth-cookie';
import {
  parseAdminProductsSearchParams,
  type AdminProductsSearchParams,
} from '../../../features/admin/admin-products-query';
import { AdminProductsScreen } from '../../../features/admin/admin-products-screen';
import { loadAdminProducts } from '../../../features/admin/admin-products-server';
import { AdminShell } from '../../../features/admin/admin-shell';

export const metadata: Metadata = { title: 'Product Management' };
export const dynamic = 'force-dynamic';

export interface AdminProductsPageProps {
  searchParams: Promise<AdminProductsSearchParams>;
}

export default async function AdminProductsPage({
  searchParams,
}: AdminProductsPageProps) {
  const parsed = parseAdminProductsSearchParams(await searchParams);
  if (parsed.kind === 'invalid') {
    return (
      <AdminShell>
        <ErrorState
          action={
            <Button href="/admin/products" variant="secondary">
              Clear product URL
            </Button>
          }
          title="Invalid product URL"
        >
          {parsed.message}
        </ErrorState>
      </AdminShell>
    );
  }
  if (!parsed.isCanonical) redirect(parsed.canonicalHref);

  const cookieStore = await cookies();
  const result = await loadAdminProducts(
    selectSessionCookieHeader(cookieStore.getAll()),
    parsed.query,
  );
  if (result.kind === 'anonymous') {
    redirect('/login?next=%2Fadmin%2Fproducts');
  }
  if (result.kind === 'denied') notFound();

  return <AdminProductsScreen query={parsed.query} result={result} />;
}
