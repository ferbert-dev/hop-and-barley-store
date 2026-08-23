import { BadRequestException } from '@nestjs/common';
import { RegistrationZodPipe } from './registration-zod.pipe';

describe('RegistrationZodPipe', () => {
  const pipe = new RegistrationZodPipe();

  it('accepts a valid email and an exactly 12-character password', () => {
    expect(
      pipe.transform({
        email: 'brewer@example.com',
        password: 'Abcdefghi1!x',
      }),
    ).toEqual({
      email: 'brewer@example.com',
      password: 'Abcdefghi1!x',
    });
  });

  it.each(['', 'not-an-email', 'brew@@example.com'])(
    'rejects empty or malformed email %p through Zod',
    (email) => {
      expect(() => pipe.transform({ email, password: 'Abcdefghi1!x' })).toThrow(
        BadRequestException,
      );
    },
  );

  it.each([
    'Abcdefg1!x',
    'ABCDEFGHI1!X',
    'abcdefghi1!x',
    'Abcdefghij!x',
    'Abcdefghi12x',
  ])('rejects a missing password requirement for %p', (password) => {
    expect(() =>
      pipe.transform({ email: 'brewer@example.com', password }),
    ).toThrow(BadRequestException);
  });

  it('rejects confirmPassword as an API credential field', () => {
    expect(() =>
      pipe.transform({
        confirmPassword: 'Abcdefghi1!x',
        email: 'brewer@example.com',
        password: 'Abcdefghi1!x',
      }),
    ).toThrow(BadRequestException);
  });
});
