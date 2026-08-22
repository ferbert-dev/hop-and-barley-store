import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { argon2id, hash } from 'argon2';
import { REGISTRATION_UNAVAILABLE } from '../auth.constants';

export const ARGON2_PARAMETERS = Object.freeze({
  algorithm: 'argon2id' as const,
  hashLength: 32,
  memoryCost: 65_536,
  parallelism: 1,
  saltLength: 16,
  timeCost: 3,
  version: 19,
});

export type PasswordHashRecord = typeof ARGON2_PARAMETERS & {
  passwordHash: string;
};

@Injectable()
export class PasswordHashExecutor {
  private activeHashes = 0;

  async hash(password: string): Promise<PasswordHashRecord> {
    if (this.activeHashes >= 2) {
      throw new ServiceUnavailableException(REGISTRATION_UNAVAILABLE);
    }

    this.activeHashes += 1;
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
      this.activeHashes -= 1;
    }
  }
}
