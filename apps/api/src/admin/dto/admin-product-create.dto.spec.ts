import { BadRequestException } from '@nestjs/common';
import { createAppValidationPipe } from '../../app-validation';
import { AdminCreateProductBodyDto } from './admin-product-create.dto';

const validBody = {
  categoryId: '10000000-0000-4000-8000-000000000001',
  description: '  A useful product description.  ',
  isActive: 'true',
  name: '  Citra Hops  ',
  price: ' 5.99 ',
  saleKind: 'WEIGHT',
  stockAmount: '100000',
};

describe('AdminCreateProductBodyDto', () => {
  const pipe = createAppValidationPipe();
  const transform = (body: Record<string, unknown>) =>
    pipe.transform(body, {
      data: undefined,
      metatype: AdminCreateProductBodyDto,
      type: 'body',
    });

  it('trims multipart text fields while preserving strict string contracts', async () => {
    await expect(transform(validBody)).resolves.toMatchObject({
      description: 'A useful product description.',
      name: 'Citra Hops',
      price: '5.99',
    });
  });

  it('rejects unknown multipart text fields', async () => {
    await expect(
      transform({ ...validBody, role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    ['price', { price: '5' }],
    ['zero price', { price: '0.00' }],
    ['price precision', { price: '5.999' }],
    ['non-canonical stock', { stockAmount: '00100000' }],
    ['sale kind', { saleKind: 'KIT' }],
    ['boolean', { isActive: '1' }],
    ['instant', { activeFrom: 'tomorrow' }],
    ['instant without zone', { activeFrom: '2026-08-29T00:00:00' }],
    ['zero package weight', { packageNetWeightMg: '0' }],
  ])('rejects an invalid %s field', async (_label, override) => {
    await expect(
      transform({ ...validBody, ...override }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
