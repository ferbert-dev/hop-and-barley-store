import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';

import { Button } from '../../../components/ui/button';
import { ErrorState } from '../../../components/ui/status';
import { selectSessionCookieHeader } from '../../../features/auth/auth-cookie';
import { AdminShell } from '../../../features/admin/admin-shell';
import { CreateProductForm } from '../../../features/admin/create-product-form';
import { loadAdminProductCreateOptions } from '../../../features/admin/admin-product-create-server';

export const metadata: Metadata = { title: 'Add Product' };
export const dynamic = 'force-dynamic';

export interface AdminAddProductPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PRODUCT_ID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export default async function AdminAddProductPage({
  searchParams,
}: AdminAddProductPageProps) {
  const intent = parseCreateIntent(await searchParams);
  const cookieStore = await cookies();
  const result = await loadAdminProductCreateOptions(
    selectSessionCookieHeader(cookieStore.getAll()),
  );

  if (result.kind === 'anonymous') {
    redirect('/login?next=%2Fadmin%2Fadd');
  }
  if (result.kind === 'denied') notFound();

  if (intent.kind === 'edit') {
    return (
      <AdminShell>
        <ErrorState
          action={
            <Button href="/admin/products" variant="secondary">
              Back to product management
            </Button>
          }
          title="Product editing is not available yet"
        >
          This page only creates new products. No change has been made to the
          selected product.
        </ErrorState>
      </AdminShell>
    );
  }
  if (intent.kind === 'invalid') {
    return (
      <AdminShell>
        <ErrorState
          action={
            <Button href="/admin/add" variant="secondary">
              Clear product URL
            </Button>
          }
          title="Invalid product URL"
        >
          This add-product link is not valid. No product can be changed from
          this page.
        </ErrorState>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      {result.kind === 'loaded' ? (
        <CreateProductForm options={result.options} />
      ) : (
        <ErrorState title="Product creation is unavailable">
          We could not load the options required to create a product safely.
          Please try again shortly.
        </ErrorState>
      )}
    </AdminShell>
  );
}

function parseCreateIntent(
  searchParams: Record<string, string | string[] | undefined>,
): { kind: 'create' | 'edit' | 'invalid' } {
  const entries = Object.entries(searchParams).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) return { kind: 'create' };
  if (entries.length !== 1 || entries[0]?.[0] !== 'productId') {
    return { kind: 'invalid' };
  }
  const value = entries[0]?.[1];
  return typeof value === 'string' && PRODUCT_ID.test(value)
    ? { kind: 'edit' }
    : { kind: 'invalid' };
}
