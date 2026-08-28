import {
  isProductImagePath,
  isUploadedProductImagePath,
} from './product-image';
import { describe, expect, it } from 'vitest';

describe('product image paths', () => {
  const uploaded = '/product-assets/12345678-1234-4abc-8abc-1234567890ab.webp';

  it('accepts only the bundled or immutable uploaded product-image forms', () => {
    expect(isProductImagePath('/assets/products/citra-hops.webp')).toBe(true);
    expect(isProductImagePath(uploaded)).toBe(true);
    expect(isUploadedProductImagePath(uploaded)).toBe(true);
  });

  it.each([
    '/product-assets/12345678-1234-4abc-7abc-1234567890ab.webp',
    '/product-assets/12345678-1234-5abc-8abc-1234567890ab.webp',
    '/product-assets/12345678-1234-4abc-8abc-1234567890ab.png',
    '/product-assets/12345678-1234-4abc-8abc-1234567890ab.webp?x=1',
    '/product-assets/../../secrets.webp',
    '/assets/products/Citra-Hops.webp',
  ])('rejects unsafe image path %s', (path) => {
    expect(isProductImagePath(path)).toBe(false);
    expect(isUploadedProductImagePath(path)).toBe(false);
  });
});
