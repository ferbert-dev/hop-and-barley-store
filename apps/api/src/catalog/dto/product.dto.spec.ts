import 'reflect-metadata';
import { ProductDto } from './product.dto';

describe('ProductDto OpenAPI contract', () => {
  it('documents bundled and opaque uploaded WebP product paths', () => {
    const metadata = Reflect.getMetadata(
      'swagger/apiModelProperties',
      ProductDto.prototype,
      'imagePath',
    ) as { example?: unknown; pattern?: unknown } | undefined;

    expect(metadata?.example).toBe(
      '/product-assets/7ed6a7c7-5210-4b1f-ae50-0d8d596216cb.webp',
    );
    expect(typeof metadata?.pattern).toBe('string');

    const pattern = new RegExp(metadata?.pattern as string);
    expect(pattern.test('/assets/products/cascade-hops.webp')).toBe(true);
    expect(
      pattern.test('/product-assets/7ed6a7c7-5210-4b1f-ae50-0d8d596216cb.webp'),
    ).toBe(true);
    expect(pattern.test('/product-assets/../secret.webp')).toBe(false);
    expect(
      pattern.test('/product-assets/7ed6a7c7-5210-1b1f-ae50-0d8d596216cb.webp'),
    ).toBe(false);
  });
});
