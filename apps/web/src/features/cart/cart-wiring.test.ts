import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('cart shared-state wiring', () => {
  it('places the browser cart boundary in the root layout for downstream add-to-cart consumers', () => {
    const layout = readFileSync(
      join(process.cwd(), 'src', 'app', 'layout.tsx'),
      'utf8',
    );
    const cartPage = readFileSync(
      join(process.cwd(), 'src', 'app', 'cart', 'page.tsx'),
      'utf8',
    );

    expect(layout).toContain("from '../features/cart/cart-context'");
    expect(layout).toMatch(/<CartProvider>[\s\S]*<StorefrontShell>/);
    expect(cartPage).not.toContain('<CartProvider>');
  });
});
