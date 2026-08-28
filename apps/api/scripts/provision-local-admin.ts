import { PrismaService } from '../src/database/prisma.service';
import {
  LocalAdminProvisioningError,
  LocalAdminProvisioningService,
} from '../src/admin/local-admin-provisioning.service';
import { PasswordHashExecutor } from '../src/auth/password/password-hash-executor';

const PASSWORD_ENVIRONMENT_KEY = 'HB_LOCAL_ADMIN_PASSWORD';
const PROMOTION_FLAG = '--promote-existing-customer';

async function main(): Promise<void> {
  const unknownArguments = process.argv
    .slice(2)
    .filter((argument) => argument !== PROMOTION_FLAG);
  if (unknownArguments.length > 0) {
    throw new LocalAdminProvisioningError(
      'Unsupported local administrator provisioning option.',
    );
  }

  const password = process.env[PASSWORD_ENVIRONMENT_KEY];
  delete process.env[PASSWORD_ENVIRONMENT_KEY];
  if (!password) {
    throw new LocalAdminProvisioningError(
      `${PASSWORD_ENVIRONMENT_KEY} is required as protected runtime input.`,
    );
  }

  const prisma = new PrismaService();
  try {
    const service = new LocalAdminProvisioningService(
      prisma,
      new PasswordHashExecutor(),
    );
    const result = await service.provision(password, {
      promoteExistingCustomer: process.argv.includes(PROMOTION_FLAG),
    });
    console.log(`Local administrator provisioning: ${result.outcome}.`);
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof LocalAdminProvisioningError
      ? error.message
      : 'Local administrator provisioning failed.',
  );
  process.exitCode = 1;
});
