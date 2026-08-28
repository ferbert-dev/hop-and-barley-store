import { Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Prisma } from '../../generated/prisma/client';
import type { UserRole } from '../../generated/prisma/enums';
import { PrismaService } from '../../database/prisma.service';
import {
  generateSessionToken,
  hashSessionToken,
  parseSessionToken,
} from './session-token';

const DEFAULT_ABSOLUTE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const REMEMBERED_ABSOLUTE_LIFETIME_MS = 30 * 24 * 60 * 60 * 1_000;
const IDLE_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const TOUCH_INTERVAL_MS = 15 * 60 * 1_000;
const MAX_ACTIVE_SESSIONS = 5;
const MAX_SERIALIZABLE_ATTEMPTS = 8;
const SERIALIZABLE_BACKOFF_BASE_MS = 5;
const MAX_SERIALIZABLE_BACKOFF_MS = 100;

export type ActiveSession = Readonly<{
  expiresAt: Date;
  issuedAt: Date;
  lastSeenAt: Date;
  rawToken: string;
  role: UserRole;
  sessionId: string;
  status: 'ACTIVE';
  userId: string;
}>;

export type SessionIssueOptions = Readonly<{
  now?: Date;
  rememberMe?: boolean;
}>;

export class SessionIssueRejectedError extends Error {
  constructor() {
    super('Session issue rejected');
  }
}

@Injectable()
export class SessionService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    userId: string,
    presentedRawToken: string | null,
    options: SessionIssueOptions = {},
  ): Promise<ActiveSession> {
    const now = options.now ?? new Date();
    const absoluteLifetimeMs =
      options.rememberMe === true
        ? REMEMBERED_ABSOLUTE_LIFETIME_MS
        : DEFAULT_ABSOLUTE_LIFETIME_MS;
    const rawToken = generateSessionToken();
    const tokenHash = toPrismaBytes(rawToken);
    const presentedTokenHash = presentedRawToken
      ? toPrismaBytes(presentedRawToken)
      : null;
    const expiresAt = new Date(now.getTime() + absoluteLifetimeMs);

    const persisted = await this.serializable(async (transaction) => {
      if (!(await lockUser(transaction, userId))) {
        throw new SessionIssueRejectedError();
      }

      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          passwordCredential: { select: { changedAt: true } },
          role: true,
          status: true,
        },
      });
      if (!user || user.status !== 'ACTIVE' || !user.passwordCredential) {
        throw new SessionIssueRejectedError();
      }

      if (presentedTokenHash) {
        await transaction.authSession.updateMany({
          data: { revokedAt: now },
          where: {
            expiresAt: { gt: now },
            lastSeenAt: {
              gt: new Date(now.getTime() - IDLE_LIFETIME_MS),
            },
            revokedAt: null,
            tokenHash: presentedTokenHash,
            userId,
          },
        });
      }

      const active = await transaction.authSession.findMany({
        orderBy: [{ issuedAt: 'asc' }, { id: 'asc' }],
        select: { id: true },
        where: {
          expiresAt: { gt: now },
          lastSeenAt: { gt: new Date(now.getTime() - IDLE_LIFETIME_MS) },
          revokedAt: null,
          userId,
        },
      });
      const overflow = active.length - (MAX_ACTIVE_SESSIONS - 1);
      if (overflow > 0) {
        await transaction.authSession.updateMany({
          data: { revokedAt: now },
          where: {
            id: { in: active.slice(0, overflow).map(({ id }) => id) },
            revokedAt: null,
          },
        });
      }

      const created = await transaction.authSession.create({
        data: {
          credentialChangedAtAtIssue: user.passwordCredential.changedAt,
          expiresAt,
          issuedAt: now,
          lastSeenAt: now,
          roleAtIssue: user.role,
          tokenHash,
          userId,
        },
        select: {
          expiresAt: true,
          id: true,
          issuedAt: true,
          lastSeenAt: true,
        },
      });

      return { ...created, role: user.role, status: user.status };
    });

    return {
      expiresAt: persisted.expiresAt,
      issuedAt: persisted.issuedAt,
      lastSeenAt: persisted.lastSeenAt,
      rawToken,
      role: persisted.role,
      sessionId: persisted.id,
      status: persisted.status,
      userId,
    };
  }

  async authenticate(
    rawToken: string,
    now = new Date(),
  ): Promise<ActiveSession | null> {
    return this.authenticateInternal(rawToken, now, true);
  }

  private async authenticateInternal(
    rawToken: string,
    now: Date,
    retryAfterConcurrentTouch: boolean,
  ): Promise<ActiveSession | null> {
    if (!parseSessionToken(rawToken)) return null;
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash: toPrismaBytes(rawToken) },
      select: {
        credentialChangedAtAtIssue: true,
        expiresAt: true,
        id: true,
        issuedAt: true,
        lastSeenAt: true,
        revokedAt: true,
        roleAtIssue: true,
        user: {
          select: {
            id: true,
            passwordCredential: { select: { changedAt: true } },
            role: true,
            status: true,
          },
        },
      },
    });

    const idleCutoff = new Date(now.getTime() - IDLE_LIFETIME_MS);
    if (
      !session ||
      session.revokedAt !== null ||
      session.expiresAt.getTime() <= now.getTime() ||
      session.lastSeenAt.getTime() <= idleCutoff.getTime() ||
      session.user.status !== 'ACTIVE' ||
      session.user.role !== session.roleAtIssue ||
      !session.user.passwordCredential ||
      session.user.passwordCredential.changedAt.getTime() !==
        session.credentialChangedAtAtIssue.getTime()
    ) {
      return null;
    }

    let lastSeenAt = session.lastSeenAt;
    const touchCutoff = new Date(now.getTime() - TOUCH_INTERVAL_MS);
    if (lastSeenAt.getTime() <= touchCutoff.getTime()) {
      const touched = await this.prisma.authSession.updateMany({
        data: { lastSeenAt: now },
        where: {
          expiresAt: { gt: now },
          id: session.id,
          lastSeenAt: { gt: idleCutoff, lte: touchCutoff },
          revokedAt: null,
        },
      });
      if (touched.count !== 1) {
        return retryAfterConcurrentTouch
          ? this.authenticateInternal(rawToken, now, false)
          : null;
      }
      lastSeenAt = now;
    }

    return {
      expiresAt: session.expiresAt,
      issuedAt: session.issuedAt,
      lastSeenAt,
      rawToken,
      role: session.user.role,
      sessionId: session.id,
      status: session.user.status,
      userId: session.user.id,
    };
  }

  async revokeCurrent(rawToken: string, now = new Date()): Promise<boolean> {
    if (!parseSessionToken(rawToken)) return false;
    const tokenHash = toPrismaBytes(rawToken);
    const session = await this.prisma.authSession.findUnique({
      where: { tokenHash },
      select: { userId: true },
    });
    if (!session) return false;

    return this.serializable(async (transaction) => {
      if (!(await lockUser(transaction, session.userId))) return false;
      const result = await transaction.authSession.updateMany({
        data: { revokedAt: now },
        where: { revokedAt: null, tokenHash, userId: session.userId },
      });
      return result.count === 1;
    });
  }

  async revokeAll(userId: string, now = new Date()): Promise<number> {
    return this.serializable(async (transaction) => {
      if (!(await lockUser(transaction, userId))) return 0;
      const result = await transaction.authSession.updateMany({
        data: { revokedAt: now },
        where: { revokedAt: null, userId },
      });
      return result.count;
    });
  }

  private async serializable<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= MAX_SERIALIZABLE_ATTEMPTS; attempt += 1) {
      try {
        return await this.prisma.$transaction(operation, {
          isolationLevel: 'Serializable',
          maxWait: 2_000,
          timeout: 5_000,
        });
      } catch (error) {
        if (!isP2034(error) || attempt === MAX_SERIALIZABLE_ATTEMPTS) {
          throw error;
        }
        await waitForSerializableRetry(attempt);
      }
    }

    throw new Error('Unreachable serializable retry state');
  }
}

function waitForSerializableRetry(attempt: number): Promise<void> {
  const cappedDelayMs = Math.min(
    MAX_SERIALIZABLE_BACKOFF_MS,
    SERIALIZABLE_BACKOFF_BASE_MS * 2 ** (attempt - 1),
  );
  const delayMs = Math.floor(Math.random() * (cappedDelayMs + 1));
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

async function lockUser(
  transaction: Prisma.TransactionClient,
  userId: string,
): Promise<boolean> {
  const rows = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "User"
    WHERE "id" = ${userId}::uuid
    FOR UPDATE
  `;
  return rows.length === 1;
}

function isP2034(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2034'
  );
}

function toPrismaBytes(rawToken: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(hashSessionToken(rawToken));
}

export function hashLoginAccountKey(normalizedEmail: string): string {
  return createHash('sha256').update(normalizedEmail, 'utf8').digest('hex');
}
