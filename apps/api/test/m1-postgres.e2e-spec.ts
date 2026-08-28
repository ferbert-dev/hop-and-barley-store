import { randomBytes } from 'node:crypto';
import { PasswordHashExecutor } from '../src/auth/password/password-hash-executor';
import { SessionService } from '../src/auth/session/session.service';
import {
  LOCAL_ADMIN_EMAIL,
  LocalAdminProvisioningError,
  LocalAdminProvisioningService,
} from '../src/admin/local-admin-provisioning.service';
import { PrismaService } from '../src/database/prisma.service';

const describePostgres = process.env.RUN_M1_POSTGRES_INTEGRATION
  ? describe
  : describe.skip;

const ADMIN_PASSWORD = createStrongTestPassword();
const CUSTOMER_PASSWORD = createStrongTestPassword();

describePostgres(
  'M1 administrator authorization with disposable PostgreSQL',
  () => {
    let hasher: PasswordHashExecutor;
    let prisma: PrismaService;
    let provisioning: LocalAdminProvisioningService;
    let sessions: SessionService;

    beforeAll(() => {
      prisma = new PrismaService();
      hasher = new PasswordHashExecutor();
      provisioning = new LocalAdminProvisioningService(prisma, hasher);
      sessions = new SessionService(prisma);
    });

    beforeEach(async () => {
      await prisma.user.deleteMany();
    });

    it('creates one exact administrator and repeats as a password-verified no-op', async () => {
      await expect(
        provisioning.provision(ADMIN_PASSWORD, {
          promoteExistingCustomer: false,
        }),
      ).resolves.toEqual({ outcome: 'created' });
      await expect(
        provisioning.provision(ADMIN_PASSWORD, {
          promoteExistingCustomer: false,
        }),
      ).resolves.toEqual({ outcome: 'unchanged' });

      const users = await prisma.user.findMany({
        select: {
          email: true,
          normalizedEmail: true,
          passwordCredential: { select: { passwordHash: true } },
          role: true,
          status: true,
        },
      });
      expect(users).toHaveLength(1);
      expect(users[0]).toMatchObject({
        email: LOCAL_ADMIN_EMAIL,
        normalizedEmail: LOCAL_ADMIN_EMAIL,
        role: 'ADMIN',
        status: 'ACTIVE',
      });
      expect(users[0].passwordCredential?.passwordHash).toMatch(
        /^\$argon2id\$v=19\$m=7168,p=1,t=5\$/,
      );
      expect(users[0].passwordCredential?.passwordHash).not.toContain(
        ADMIN_PASSWORD,
      );
    });

    it('rejects silent customer promotion and revokes sessions on explicit promotion', async () => {
      const credential = await hasher.hash(CUSTOMER_PASSWORD);
      const customer = await prisma.user.create({
        data: {
          email: LOCAL_ADMIN_EMAIL,
          normalizedEmail: LOCAL_ADMIN_EMAIL,
          passwordCredential: { create: credential },
        },
        select: { id: true },
      });
      const issued = await sessions.issue(customer.id, null);

      await expect(
        provisioning.provision(CUSTOMER_PASSWORD, {
          promoteExistingCustomer: false,
        }),
      ).rejects.toBeInstanceOf(LocalAdminProvisioningError);
      await expect(
        sessions.authenticate(issued.rawToken),
      ).resolves.toMatchObject({
        role: 'CUSTOMER',
        status: 'ACTIVE',
        userId: customer.id,
      });

      await expect(
        provisioning.provision(CUSTOMER_PASSWORD, {
          promoteExistingCustomer: true,
        }),
      ).resolves.toEqual({ outcome: 'promoted' });
      await expect(sessions.authenticate(issued.rawToken)).resolves.toBeNull();
      await expect(
        prisma.user.findUniqueOrThrow({
          select: { role: true, status: true },
          where: { id: customer.id },
        }),
      ).resolves.toEqual({ role: 'ADMIN', status: 'ACTIVE' });
      await expect(
        prisma.authSession.count({
          where: { revokedAt: { not: null }, userId: customer.id },
        }),
      ).resolves.toBe(1);
    });

    it('loads role and status from the current user row on every request', async () => {
      const credential = await hasher.hash(ADMIN_PASSWORD);
      const user = await prisma.user.create({
        data: {
          email: 'role-refresh@example.com',
          normalizedEmail: 'role-refresh@example.com',
          passwordCredential: { create: credential },
          role: 'ADMIN',
        },
        select: { id: true },
      });
      const adminSession = await sessions.issue(user.id, null);
      await expect(
        sessions.authenticate(adminSession.rawToken),
      ).resolves.toMatchObject({ role: 'ADMIN', status: 'ACTIVE' });

      await prisma.user.update({
        data: { role: 'CUSTOMER' },
        where: { id: user.id },
      });
      await expect(
        sessions.authenticate(adminSession.rawToken),
      ).resolves.toBeNull();

      const customerSession = await sessions.issue(user.id, null);
      await expect(
        sessions.authenticate(customerSession.rawToken),
      ).resolves.toMatchObject({ role: 'CUSTOMER', status: 'ACTIVE' });
      await prisma.user.update({
        data: { status: 'DISABLED' },
        where: { id: user.id },
      });
      await expect(
        sessions.authenticate(customerSession.rawToken),
      ).resolves.toBeNull();
    });

    afterAll(async () => {
      await prisma?.$disconnect();
    });
  },
);

function createStrongTestPassword(): string {
  return `Aa1!${randomBytes(18).toString('base64url')}`;
}
