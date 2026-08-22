import { Injectable } from '@nestjs/common';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_TRACKED_IDENTITIES = 10_000;

type BucketLimits = Readonly<{ hour: number; minute: number }>;

class SlidingWindowBuckets {
  private readonly attempts = new Map<string, number[]>();

  constructor(private readonly limits: BucketLimits) {}

  consume(identity: string, now: number): boolean {
    let existing = this.attempts.get(identity);
    if (!existing && this.attempts.size >= MAX_TRACKED_IDENTITIES) {
      this.pruneExpired(now);
      existing = this.attempts.get(identity);
      if (!existing && this.attempts.size >= MAX_TRACKED_IDENTITIES) {
        return false;
      }
    }

    const hourStart = now - HOUR_MS;
    const retained = (existing ?? []).filter((attempt) => attempt > hourStart);
    const minuteStart = now - MINUTE_MS;
    const minuteCount = retained.filter(
      (attempt) => attempt > minuteStart,
    ).length;
    if (
      minuteCount >= this.limits.minute ||
      retained.length >= this.limits.hour
    ) {
      this.store(identity, retained);
      return false;
    }

    retained.push(now);
    this.store(identity, retained);
    return true;
  }

  private pruneExpired(now: number): void {
    const hourStart = now - HOUR_MS;
    for (const [identity, attempts] of this.attempts) {
      this.store(
        identity,
        attempts.filter((attempt) => attempt > hourStart),
      );
    }
  }

  private store(identity: string, attempts: number[]): void {
    if (attempts.length === 0) this.attempts.delete(identity);
    else this.attempts.set(identity, attempts);
  }
}

@Injectable()
export class LoginRateLimiter {
  private readonly accountBuckets = new SlidingWindowBuckets({
    hour: 20,
    minute: 5,
  });
  private readonly ipBuckets = new SlidingWindowBuckets({
    hour: 50,
    minute: 10,
  });

  consumeIp(clientAddress: string, now = Date.now()): boolean {
    return this.ipBuckets.consume(clientAddress, now);
  }

  consumeAccount(accountKey: string, now = Date.now()): boolean {
    return this.accountBuckets.consume(accountKey, now);
  }
}
