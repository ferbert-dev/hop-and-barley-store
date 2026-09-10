import type { Metadata } from 'next';
import { cookies } from 'next/headers';

import { CheckoutScreen } from '../../features/checkout/checkout-screen';
import { readCurrentUserProfile } from '../../features/account/profile-server';
import { selectSessionCookieHeader } from '../../features/auth/auth-cookie';

export const metadata: Metadata = { title: 'Checkout | Hop & Barley' };
export const dynamic = 'force-dynamic';

export default async function CheckoutPage() {
  const cookieStore = await cookies();
  const profile = await readCurrentUserProfile(
    selectSessionCookieHeader(cookieStore.getAll()),
  );
  return (
    <CheckoutScreen
      initialProfile={profile.kind === 'authenticated' ? profile.profile : null}
    />
  );
}
