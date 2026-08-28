import type { ArgumentMetadata } from '@nestjs/common';
import { createAppValidationPipe } from '../app-validation';
import { UpdateCurrentUserDto } from './dto/user-profile.dto';

describe('UpdateCurrentUserDto allow-list', () => {
  const metadata: ArgumentMetadata = {
    data: undefined,
    metatype: UpdateCurrentUserDto,
    type: 'body',
  };

  it.each([
    'email',
    'role',
    'status',
    'password',
    'passwordHash',
    'sessionId',
    'userId',
  ])('rejects mass-assignment field %s', async (field) => {
    await expect(
      createAppValidationPipe().transform(
        {
          profile: { fullName: 'Brewer' },
          [field]: field === 'email' ? 'other@example.com' : 'ADMIN',
        },
        metadata,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects unknown nested fields and preserves phone exactly as entered', async () => {
    await expect(
      createAppValidationPipe().transform(
        { profile: { phone: '  +49 123  ', role: 'ADMIN' } },
        metadata,
      ),
    ).rejects.toMatchObject({ status: 400 });

    await expect(
      createAppValidationPipe().transform(
        { profile: { phone: '  +49 123  ' } },
        metadata,
      ),
    ).resolves.toMatchObject({ profile: { phone: '  +49 123  ' } });
  });

  it('keeps every address field optional and supports clearing nested records', async () => {
    await expect(
      createAppValidationPipe().transform(
        { primaryAddress: { city: 'Madrid' }, profile: null },
        metadata,
      ),
    ).resolves.toMatchObject({
      primaryAddress: { city: 'Madrid' },
      profile: null,
    });
  });
});
