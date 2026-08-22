import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import type { LoginDto } from './dto/login.dto';
import { canonicalizeRegistrationEmail } from './email-normalization';
import { LoginRateLimiter } from './login-rate-limiter';
import { PasswordHashExecutor } from './password/password-hash-executor';
import {
  hashLoginAccountKey,
  SessionIssueRejectedError,
  SessionService,
  type ActiveSession,
} from './session/session.service';

const UNKNOWN_ACCOUNT_SALT = Buffer.from('a1b-dummy-salt!!')
  .toString('base64')
  .replace(/=+$/, '');
const UNKNOWN_ACCOUNT_DIGEST = Buffer.from([
  189, 84, 98, 96, 63, 199, 66, 49, 238, 62, 93, 191, 165, 149, 233, 149, 43,
  193, 52, 38, 120, 240, 102, 140, 152, 164, 254, 157, 80, 68, 19, 155,
])
  .toString('base64')
  .replace(/=+$/, '');

// Public deterministic PHC for equal-cost unknown-account verification only.
export const UNKNOWN_ACCOUNT_PHC = [
  '$argon2id',
  'v=19',
  'm=7168,p=1,t=5',
  UNKNOWN_ACCOUNT_SALT,
  UNKNOWN_ACCOUNT_DIGEST,
].join('$');

const GENERIC_UNAUTHORIZED = Object.freeze({ status: 'unauthorized' as const });
const LOGIN_UNAVAILABLE = Object.freeze({ status: 'unavailable' as const });

@Injectable()
export class LoginService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHashExecutor,
    private readonly sessions: SessionService,
    private readonly rateLimiter: LoginRateLimiter,
  ) {}

  async login(
    dto: LoginDto,
    presentedRawToken: string | null,
  ): Promise<ActiveSession> {
    let normalizedEmail: string | null = null;
    try {
      normalizedEmail = canonicalizeRegistrationEmail(
        dto.email,
      ).normalizedEmail;
    } catch {
      // Invalid identifiers still consume one bounded dummy verification below.
    }

    const accountKey = hashLoginAccountKey(
      normalizedEmail ?? dto.email.normalize('NFC').toLowerCase(),
    );
    if (!this.rateLimiter.consumeAccount(accountKey)) {
      throw new HttpException(LOGIN_UNAVAILABLE, HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = normalizedEmail
      ? await this.prisma.user.findUnique({
          where: { normalizedEmail },
          select: {
            id: true,
            passwordCredential: { select: { passwordHash: true } },
            role: true,
            status: true,
          },
        })
      : null;
    const passwordHash =
      user?.passwordCredential?.passwordHash ?? UNKNOWN_ACCOUNT_PHC;
    const verified = await this.passwordHasher.verify(
      passwordHash,
      dto.password,
    );

    if (
      !verified ||
      !user ||
      user.status !== 'ACTIVE' ||
      !user.passwordCredential
    ) {
      throw new UnauthorizedException(GENERIC_UNAUTHORIZED);
    }

    try {
      return await this.sessions.issue(user.id, presentedRawToken);
    } catch (error) {
      if (error instanceof SessionIssueRejectedError) {
        throw new UnauthorizedException(GENERIC_UNAUTHORIZED);
      }
      throw error;
    }
  }
}
