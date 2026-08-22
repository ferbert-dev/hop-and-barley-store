import { ForbiddenException } from '@nestjs/common';
import { AuthOriginService } from './auth-origin.service';

describe('AuthOriginService', () => {
  const service = new AuthOriginService({
    get: () => 'http://localhost:3000',
  } as never);

  it('accepts only the byte-exact configured Origin', () => {
    expect(() => service.assertExact('http://localhost:3000')).not.toThrow();
    for (const origin of [
      undefined,
      'http://LOCALHOST:3000',
      'http://localhost:3000/',
      'http://localhost:3001',
      'https://localhost:3000',
    ]) {
      expect(() => service.assertExact(origin)).toThrow(ForbiddenException);
    }
  });
});
