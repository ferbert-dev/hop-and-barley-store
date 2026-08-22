import { argon2id, hash } from 'argon2';
import {
  ARGON2_PARAMETERS,
  PasswordHashExecutor,
} from './password-hash-executor';

jest.mock('argon2', () => ({
  argon2id: 2,
  hash: jest.fn(),
}));

const mockedHash = jest.mocked(hash);

describe('PasswordHashExecutor', () => {
  beforeEach(() => mockedHash.mockReset());

  it('uses the selected Argon2id v19 parameters and a fresh 16-byte salt', async () => {
    mockedHash.mockResolvedValue(
      '$argon2id$v=19$m=65536,p=1,t=3$c2FsdHNhbHRzYWx0MTIzNA$hash',
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
      memoryCost: 65_536,
      parallelism: 1,
      timeCost: 3,
      type: argon2id,
      version: 0x13,
    });
    expect(options.salt).toBeInstanceOf(Buffer);
    expect(options.salt).toHaveLength(16);
    expect(result).toMatchObject(ARGON2_PARAMETERS);
    expect(result.passwordHash).toMatch(/^\$argon2id\$v=19\$/);
  });

  it('permits two active hashes and queues none', async () => {
    const releases: Array<() => void> = [];
    mockedHash.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          releases.push(() =>
            resolve('$argon2id$v=19$m=65536,p=1,t=3$salt$hash'),
          );
        }),
    );
    const executor = new PasswordHashExecutor();
    const first = executor.hash('first-long-enough-password');
    const second = executor.hash('second-long-enough-password');

    await expect(
      executor.hash('third-long-enough-password'),
    ).rejects.toMatchObject({
      status: 503,
    });
    expect(mockedHash).toHaveBeenCalledTimes(2);

    releases.splice(0).forEach((release) => release());
    await Promise.all([first, second]);
  });
});
