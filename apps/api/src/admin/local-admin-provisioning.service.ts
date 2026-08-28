import { Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';
import { PasswordHashExecutor } from '../auth/password/password-hash-executor';
import { normalizeRegistrationPassword } from '../auth/password/password-policy';

export const LOCAL_ADMIN_EMAIL = 'admin@gmail.com';

export type LocalAdminProvisioningIntent = Readonly<{
  promoteExistingCustomer: boolean;
}>;

export type LocalAdminProvisioningResult = Readonly<{
  outcome: 'created' | 'promoted' | 'unchanged';
}>;

export class LocalAdminProvisioningError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalAdminProvisioningError';
  }
}

@Injectable()
export class LocalAdminProvisioningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordHasher: PasswordHashExecutor,
  ) {}

  async provision(
    passwordInput: string,
    intent: LocalAdminProvisioningIntent,
  ): Promise<LocalAdminProvisioningResult> {
    const password = normalizeProvisioningPassword(passwordInput);
    const existing = await this.prisma.user.findUnique({
      select: {
        id: true,
        passwordCredential: { select: { passwordHash: true } },
        role: true,
        status: true,
      },
      where: { normalizedEmail: LOCAL_ADMIN_EMAIL },
    });

    if (!existing) {
      const credential = await this.passwordHasher.hash(password);
      await this.prisma.user.create({
        data: {
          email: LOCAL_ADMIN_EMAIL,
          normalizedEmail: LOCAL_ADMIN_EMAIL,
          passwordCredential: { create: credential },
          role: 'ADMIN',
          status: 'ACTIVE',
        },
        select: { id: true },
      });
      return { outcome: 'created' };
    }

    if (
      existing.status !== 'ACTIVE' ||
      !existing.passwordCredential ||
      (existing.role === 'CUSTOMER' && !intent.promoteExistingCustomer)
    ) {
      throw reconciliationError();
    }

    const existingPasswordHash = existing.passwordCredential.passwordHash;
    const passwordMatches = await this.passwordHasher.verify(
      existingPasswordHash,
      password,
    );
    if (!passwordMatches) throw reconciliationError();
    if (existing.role === 'ADMIN') return { outcome: 'unchanged' };

    const promotedAt = new Date();
    await this.prisma.$transaction(
      async (transaction) => {
        const current = await transaction.user.findUnique({
          select: {
            id: true,
            passwordCredential: { select: { passwordHash: true } },
            role: true,
            status: true,
          },
          where: { id: existing.id },
        });
        if (
          !current ||
          current.role !== 'CUSTOMER' ||
          current.status !== 'ACTIVE' ||
          current.passwordCredential?.passwordHash !== existingPasswordHash
        ) {
          throw reconciliationError();
        }

        await transaction.user.update({
          data: { email: LOCAL_ADMIN_EMAIL, role: 'ADMIN' },
          select: { id: true },
          where: { id: existing.id },
        });
        await transaction.authSession.updateMany({
          data: { revokedAt: promotedAt },
          where: { revokedAt: null, userId: existing.id },
        });
      },
      { isolationLevel: 'Serializable', maxWait: 2_000, timeout: 5_000 },
    );

    return { outcome: 'promoted' };
  }
}

function normalizeProvisioningPassword(passwordInput: string): string {
  try {
    return normalizeRegistrationPassword(passwordInput);
  } catch {
    throw new LocalAdminProvisioningError(
      'The protected local administrator password does not satisfy policy.',
    );
  }
}

function reconciliationError(): LocalAdminProvisioningError {
  return new LocalAdminProvisioningError(
    'The existing local administrator identity cannot be safely reconciled.',
  );
}
