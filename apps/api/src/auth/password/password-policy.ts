import { BadRequestException } from '@nestjs/common';
import {
  normalizePasswordInput,
  registrationPasswordSchema,
} from '@hop-and-barley/auth-contract';

export function normalizeRegistrationPassword(input: string): string {
  const result = registrationPasswordSchema.safeParse(input);
  if (!result.success) {
    throw new BadRequestException('Invalid registration input.');
  }

  return result.data;
}

export function normalizePasswordForHashing(input: string): string {
  return normalizePasswordInput(input);
}
