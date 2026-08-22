import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { argon2id, hash, verify } from 'argon2';
import { REGISTRATION_UNAVAILABLE } from '../auth.constants';

export const ARGON2_PARAMETERS = Object.freeze({
  algorithm: 'argon2id' as const,
  hashLength: 32,
  memoryCost: 7_168,
  parallelism: 1,
  saltLength: 16,
  timeCost: 5,
  version: 19,
});

export const MAX_ACTIVE_PASSWORD_OPERATIONS = 5;

export type PasswordHashRecord = typeof ARGON2_PARAMETERS & {
  passwordHash: string;
};

@Injectable()
export class PasswordHashExecutor {
  private activeOperations = 0;

  async hash(password: string): Promise<PasswordHashRecord> {
    this.acquire();
    try {
      const passwordHash = await hash(password, {
        hashLength: ARGON2_PARAMETERS.hashLength,
        memoryCost: ARGON2_PARAMETERS.memoryCost,
        parallelism: ARGON2_PARAMETERS.parallelism,
        salt: randomBytes(ARGON2_PARAMETERS.saltLength),
        timeCost: ARGON2_PARAMETERS.timeCost,
        type: argon2id,
        version: 0x13,
      });

      return { ...ARGON2_PARAMETERS, passwordHash };
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      throw new ServiceUnavailableException(REGISTRATION_UNAVAILABLE);
    } finally {
      this.release();
    }
  }

  async verify(passwordHash: string, password: string): Promise<boolean> {
    this.acquire();
    try {
      return await verify(passwordHash, password);
    } catch (error) {
      if (error instanceof ServiceUnavailableException) throw error;
      return false;
    } finally {
      this.release();
    }
  }

  private acquire(): void {
    if (this.activeOperations >= MAX_ACTIVE_PASSWORD_OPERATIONS) {
      throw new ServiceUnavailableException(REGISTRATION_UNAVAILABLE);
    }
    this.activeOperations += 1;
  }

  private release(): void {
    this.activeOperations -= 1;
  }
}
