import { BadRequestException } from '@nestjs/common';
import { registrationPasswordSchema } from '@hop-and-barley/auth-contract';

export function normalizeRegistrationPassword(input: string): string {
  const password = normalizePasswordForHashing(input);
  if (!registrationPasswordSchema.safeParse(password).success) {
    throw new BadRequestException('Invalid registration input.');
  }

  return password;
}

export function normalizePasswordForHashing(input: string): string {
  return input.normalize('NFC');
}
