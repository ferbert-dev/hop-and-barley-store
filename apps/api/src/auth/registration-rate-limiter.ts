import { Injectable } from '@nestjs/common';

const MINUTE_MS = 60_000;
const HOUR_MS = 3_600_000;
const MAX_TRACKED_CLIENTS = 10_000;

@Injectable()
export class RegistrationRateLimiter {
  private readonly attempts = new Map<string, number[]>();

  consume(clientAddress: string, now = Date.now()): boolean {
    let existing = this.attempts.get(clientAddress);
    if (!existing && this.attempts.size >= MAX_TRACKED_CLIENTS) {
      this.pruneExpired(now);
      existing = this.attempts.get(clientAddress);
      if (!existing && this.attempts.size >= MAX_TRACKED_CLIENTS) return false;
    }

    const hourStart = now - HOUR_MS;
    const retained = (existing ?? []).filter((attempt) => attempt > hourStart);
    const minuteStart = now - MINUTE_MS;
    const minuteCount = retained.filter(
      (attempt) => attempt > minuteStart,
    ).length;
    if (minuteCount >= 5 || retained.length >= 20) {
      this.store(clientAddress, retained);
      return false;
    }

    retained.push(now);
    this.store(clientAddress, retained);
    return true;
  }

  private store(clientAddress: string, attempts: number[]): void {
    if (attempts.length === 0) this.attempts.delete(clientAddress);
    else this.attempts.set(clientAddress, attempts);
  }

  private pruneExpired(now: number): void {
    const hourStart = now - HOUR_MS;
    for (const [clientAddress, attempts] of this.attempts) {
      const retained = attempts.filter((attempt) => attempt > hourStart);
      this.store(clientAddress, retained);
    }
  }
}
