import { argon2id, hash, verify } from 'argon2';
import {
  ARGON2_PARAMETERS,
  PasswordHashExecutor,
} from './password-hash-executor';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn(),
  verify: jest.fn(),
}));

const mockedHash = jest.mocked(hash);
const mockedVerify = jest.mocked(verify);

describe('PasswordHashExecutor', () => {
  beforeEach(() => {
    mockedHash.mockReset();
    mockedVerify.mockReset();
  });

  it('uses the selected Argon2id v19 parameters and a fresh 16-byte salt', async () => {
    mockedHash.mockResolvedValue(
      '$argon2id$v=19$m=7168,p=1,t=5$c2FsdHNhbHRzYWx0MTIzNA$hash',
    );
    const executor = new PasswordHashExecutor();

    const result = await executor.hash('correct horse battery staple');

    expect(mockedHash).toHaveBeenCalledTimes(1);
    expect(mockedHash.mock.calls[0][0]).toBe('correct horse battery staple');
    const options = mockedHash.mock.calls[0][1] as unknown as {
      hashLength: number;
      memoryCost: number;
      parallelism: number;
      salt: Buffer;
      timeCost: number;
      type: number;
      version: number;
    };
    expect(options).toMatchObject({
      hashLength: 32,
      memoryCost: 7_168,
      parallelism: 1,
      timeCost: 5,
      type: argon2id,
      version: 0x13,
    });
    expect(options.salt).toBeInstanceOf(Buffer);
    expect(options.salt).toHaveLength(16);
    expect(result).toMatchObject(ARGON2_PARAMETERS);
    expect(result.passwordHash).toMatch(/^\$argon2id\$v=19\$/);
  });

  it('permits five active hashes and queues none', async () => {
    const releases: Array<() => void> = [];
    mockedHash.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          releases.push(() =>
            resolve('$argon2id$v=19$m=7168,p=1,t=5$salt$hash'),
          );
        }),
    );
    const executor = new PasswordHashExecutor();
    const active = Array.from({ length: 5 }, (_, index) =>
      executor.hash(`active-long-enough-password-${index}`),
    );

    await expect(
      executor.hash('overload-long-enough-password'),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(mockedHash).toHaveBeenCalledTimes(5);

    releases.splice(0).forEach((release) => release());
    await Promise.all(active);
  });

  it('shares the same five-active/no-queue budget with verification', async () => {
    const releases: Array<() => void> = [];
    mockedVerify.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          releases.push(() => resolve(true));
        }),
    );
    const executor = new PasswordHashExecutor();
    const active = Array.from({ length: 5 }, (_, index) =>
      executor.verify(`$argon2id$valid-${index}`, `password-${index}`),
    );

    await expect(
      executor.verify('$argon2id$overload', 'overload-password'),
    ).rejects.toMatchObject({ status: 503 });
    expect(mockedVerify).toHaveBeenCalledTimes(5);

    releases.splice(0).forEach((release) => release());
    await expect(Promise.all(active)).resolves.toEqual([
      true,
      true,
      true,
      true,
      true,
    ]);
  });
});
