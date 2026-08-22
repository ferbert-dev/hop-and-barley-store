import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import {
  REGISTRATION_ACCEPTED,
  REGISTRATION_UNAVAILABLE,
} from './auth.constants';
import type { RegisterDto } from './dto/register.dto';
import type { RegistrationAcceptedDto } from './dto/registration-accepted.dto';
import { canonicalizeRegistrationEmail } from './email-normalization';
import { PasswordHashExecutor } from './password/password-hash-executor';
import { normalizeRegistrationPassword } from './password/password-policy';

@Injectable()
export class RegistrationService {
  private readonly logger = new Logger(RegistrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHashExecutor,
  ) {}

  async register(
    dto: RegisterDto,
    requestId: string,
  ): Promise<RegistrationAcceptedDto> {
    let email: string;
    let normalizedEmail: string;
    let password: string;
    try {
      ({ email, normalizedEmail } = canonicalizeRegistrationEmail(dto.email));
      password = normalizeRegistrationPassword(dto.password);
    } catch (error) {
      this.logger.warn(
        `auth.registration.rejected reason=input_policy request_id=${requestId}`,
      );
      if (error instanceof BadRequestException) throw error;
      throw new BadRequestException('Invalid registration input.');
    }

    const credential = await this.passwordHasher.hash(password);

    try {
      await this.prisma.user.create({
        data: {
          email,
          normalizedEmail,
          passwordCredential: { create: credential },
        },
        select: { id: true },
      });
      this.logger.log(
        `auth.registration.accepted outcome=created request_id=${requestId}`,
      );
    } catch (error) {
      if (isNormalizedEmailConflict(error)) {
        this.logger.log(
          `auth.registration.accepted outcome=duplicate request_id=${requestId}`,
        );
      } else {
        this.logger.error(
          `auth.registration.failed reason=storage request_id=${requestId}`,
        );
        throw new ServiceUnavailableException(REGISTRATION_UNAVAILABLE);
      }
    }

    return REGISTRATION_ACCEPTED;
  }
}

function isNormalizedEmailConflict(error: unknown): boolean {
  if (!isRecord(error)) return false;
  const candidate = error as { code?: unknown; meta?: unknown };
  if (candidate.code !== 'P2002') return false;
  if (!isRecord(candidate.meta)) return false;

  if (isNormalizedEmailTarget(candidate.meta.target)) return true;

  const driverAdapterError = candidate.meta.driverAdapterError;
  if (!isRecord(driverAdapterError) || !isRecord(driverAdapterError.cause)) {
    return false;
  }
  const cause = driverAdapterError.cause;
  if (
    cause.kind !== 'UniqueConstraintViolation' ||
    !isRecord(cause.constraint)
  ) {
    return false;
  }

  return (
    cause.constraint.index === 'User_normalizedEmail_key' ||
    isNormalizedEmailTarget(cause.constraint.fields)
  );
}

function isNormalizedEmailTarget(target: unknown): boolean {
  return (
    target === 'User_normalizedEmail_key' ||
    target === 'normalizedEmail' ||
    (Array.isArray(target) &&
      target.length === 1 &&
      (target[0] === 'normalizedEmail' || target[0] === '"normalizedEmail"'))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}
