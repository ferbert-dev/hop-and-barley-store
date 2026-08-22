import { RegistrationRateLimiter } from './registration-rate-limiter';

describe('RegistrationRateLimiter', () => {
  it('enforces both five-per-minute and twenty-per-hour windows', () => {
    const minuteLimiter = new RegistrationRateLimiter();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(minuteLimiter.consume('client-a', attempt * 1_000)).toBe(true);
    }
    expect(minuteLimiter.consume('client-a', 5_000)).toBe(false);
    expect(minuteLimiter.consume('client-a', 61_000)).toBe(true);

    const hourLimiter = new RegistrationRateLimiter();
    for (let attempt = 0; attempt < 20; attempt += 1) {
      expect(hourLimiter.consume('client-b', attempt * 180_000)).toBe(true);
    }
    expect(hourLimiter.consume('client-b', 3_480_000)).toBe(false);
  });

  it('recovers deterministically after entries age out', () => {
    const limiter = new RegistrationRateLimiter();
    for (let client = 0; client < 10_000; client += 1) {
      expect(limiter.consume(`client-${client}`, 0)).toBe(true);
    }
    expect(limiter.consume('new-client', 1)).toBe(false);
    expect(limiter.consume('new-client', 3_600_001)).toBe(true);
  });
});
