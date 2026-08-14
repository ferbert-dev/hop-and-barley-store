import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Hop & Barley Store',
  description: 'A working storefront foundation for Hop & Barley.',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
