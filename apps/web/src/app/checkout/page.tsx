import type { Metadata } from 'next';

import { CheckoutScreen } from '../../features/checkout/checkout-screen';

export const metadata: Metadata = { title: 'Checkout | Hop & Barley' };
export const dynamic = 'force-dynamic';

export default function CheckoutPage() {
  return <CheckoutScreen />;
}
