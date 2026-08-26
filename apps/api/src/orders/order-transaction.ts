import type { Prisma } from '../generated/prisma/client';

const MAX_ATTEMPTS = 8;
const BASE_DELAY_MS = 5;
const MAX_DELAY_MS = 100;

type TransactionHost = {
  $transaction<T>(
    operation: (transaction: Prisma.TransactionClient) => Promise<T>,
    options: {
      isolationLevel: 'Serializable';
      maxWait: number;
      timeout: number;
    },
  ): Promise<T>;
};

export async function runOrderSerializable<T>(
  host: TransactionHost,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await host.$transaction(operation, {
        isolationLevel: 'Serializable',
        maxWait: 2_000,
        timeout: 5_000,
      });
    } catch (error) {
      if (!isRetryableSerialization(error) || attempt === MAX_ATTEMPTS) {
        throw error;
      }
      const ceiling = Math.min(
        MAX_DELAY_MS,
        BASE_DELAY_MS * 2 ** (attempt - 1),
      );
      await wait(Math.floor(Math.random() * (ceiling + 1)));
    }
  }
  throw new Error('Unreachable order transaction retry state');
}

function isRetryableSerialization(error: unknown): boolean {
  if (error === null || typeof error !== 'object' || !('code' in error)) {
    return false;
  }
  if (error.code === 'P2034') return true;
  if (
    (error.code !== 'P2010' && error.code !== 'P2039') ||
    !('meta' in error)
  ) {
    return false;
  }
  const meta = error.meta;
  if (
    meta === null ||
    typeof meta !== 'object' ||
    !('driverAdapterError' in meta)
  ) {
    return false;
  }
  const driverError = meta.driverAdapterError;
  if (
    driverError === null ||
    typeof driverError !== 'object' ||
    !('cause' in driverError)
  ) {
    return false;
  }
  const cause = driverError.cause;
  return (
    cause !== null &&
    typeof cause === 'object' &&
    'originalCode' in cause &&
    (cause.originalCode === '40001' || cause.originalCode === '40P01')
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
