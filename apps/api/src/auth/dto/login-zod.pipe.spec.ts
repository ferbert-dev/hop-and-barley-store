import { BadRequestException } from '@nestjs/common';
import { LoginZodPipe } from './login-zod.pipe';

describe('LoginZodPipe', () => {
  const pipe = new LoginZodPipe();
  const credentials = {
    email: 'brewer@example.com',
    password: 'correct-password-value',
  };

  it.each([
    [{ ...credentials, rememberMe: true }, true],
    [{ ...credentials, rememberMe: false }, false],
    [credentials, false],
    [{ ...credentials, rememberMe: 'true' }, false],
    [{ ...credentials, rememberMe: 1 }, false],
    [{ ...credentials, rememberMe: null }, false],
  ])('normalizes the remember-me choice for %#', (input, rememberMe) => {
    expect(pipe.transform(input)).toEqual({ ...credentials, rememberMe });
  });

  it('rejects unknown credential fields', () => {
    expect(() => pipe.transform({ ...credentials, persistent: true })).toThrow(
      BadRequestException,
    );
  });
});
