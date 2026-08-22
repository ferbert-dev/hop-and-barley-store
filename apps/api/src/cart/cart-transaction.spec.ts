import { runCartSerializable } from './cart-transaction';

describe('cart Serializable transaction retry', () => {
  it('retries only P2034 with bounded full-jitter delays', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockRejectedValueOnce({ code: 'P2034' })
      .mockResolvedValue('done');
    const sleep = jest.fn().mockResolvedValue(undefined);

    await expect(
      runCartSerializable(
        { $transaction: transaction },
        () => Promise.resolve('ignored'),
        { random: () => 0.5, sleep },
      ),
    ).resolves.toBe('done');
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(transaction).toHaveBeenCalledWith(expect.any(Function), {
      isolationLevel: 'Serializable',
      maxWait: 2_000,
      timeout: 5_000,
    });
    expect(sleep).toHaveBeenNthCalledWith(1, 3);
    expect(sleep).toHaveBeenNthCalledWith(2, 5);
  });

  it('stops after the bounded attempt count', async () => {
    const conflict = { code: 'P2034' };
    const transaction = jest.fn().mockRejectedValue(conflict);

    await expect(
      runCartSerializable(
        { $transaction: transaction },
        () => Promise.resolve(undefined),
        { random: () => 0, sleep: () => Promise.resolve(undefined) },
      ),
    ).rejects.toBe(conflict);
    expect(transaction).toHaveBeenCalledTimes(8);
  });
});
