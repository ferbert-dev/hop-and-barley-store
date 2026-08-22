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

type RetryControls = Readonly<{
  random?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
}>;

export async function runCartSerializable<T>(
  host: TransactionHost,
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
  controls: RetryControls = {},
): Promise<T> {
  const random = controls.random ?? Math.random;
  const sleep = controls.sleep ?? wait;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await host.$transaction(operation, {
        isolationLevel: 'Serializable',
        maxWait: 2_000,
        timeout: 5_000,
      });
    } catch (error) {
      if (!isP2034(error) || attempt === MAX_ATTEMPTS) throw error;
      const ceiling = Math.min(
        MAX_DELAY_MS,
        BASE_DELAY_MS * 2 ** (attempt - 1),
      );
      await sleep(Math.floor(random() * (ceiling + 1)));
    }
  }
  throw new Error('Unreachable cart transaction retry state');
}

function isP2034(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2034'
  );
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
