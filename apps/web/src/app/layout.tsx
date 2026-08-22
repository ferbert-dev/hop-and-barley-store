import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StorefrontShell } from '../components/storefront/storefront-shell';
import { CartProvider } from '../features/cart/cart-context';
import '../styles/design-tokens.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hop & Barley Store',
  description: 'A working storefront foundation for Hop & Barley.',
};

type RootLayoutProps = Readonly<{
  children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en-GB">
      <body>
        <CartProvider>
          <StorefrontShell>{children}</StorefrontShell>
        </CartProvider>
      </body>
    </html>
  );
}
