import { ForbiddenException } from '@nestjs/common';
import { AuthOriginService } from './auth-origin.service';

describe('AuthOriginService', () => {
  const origins = 'http://localhost:3000,http://127.0.0.1:3000';
  const service = new AuthOriginService({
    getOrThrow: () => origins,
  } as never);

  it('accepts every byte-exact configured Origin', () => {
    expect(() => service.assertExact('http://localhost:3000')).not.toThrow();
    expect(() => service.assertExact('http://127.0.0.1:3000')).not.toThrow();
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
