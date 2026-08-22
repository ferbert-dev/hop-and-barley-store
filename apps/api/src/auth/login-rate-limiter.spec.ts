import { LoginRateLimiter } from './login-rate-limiter';

describe('LoginRateLimiter', () => {
  it('maintains independent IP and account buckets', () => {
    const limiter = new LoginRateLimiter();

    for (let attempt = 0; attempt < 10; attempt += 1) {
      expect(limiter.consumeIp('127.0.0.1', attempt * 1_000)).toBe(true);
    }
    expect(limiter.consumeIp('127.0.0.1', 10_000)).toBe(false);
    expect(limiter.consumeIp('127.0.0.2', 10_000)).toBe(true);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(limiter.consumeAccount('account-a', attempt * 1_000)).toBe(true);
    }
    expect(limiter.consumeAccount('account-a', 5_000)).toBe(false);
    expect(limiter.consumeAccount('account-b', 5_000)).toBe(true);
  });

  it('does not queue or merge the two bucket identities', () => {
    const limiter = new LoginRateLimiter();

    expect(limiter.consumeIp('same-value', 0)).toBe(true);
    expect(limiter.consumeAccount('same-value', 0)).toBe(true);
  });
});
