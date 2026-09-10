import {
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from '@nestjs/common';
import { StripePaymentService } from './stripe-payment.service';

const RECONCILIATION_INTERVAL_MS = 30_000;

@Injectable()
export class StripeReconciliationWorker
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(StripeReconciliationWorker.name);
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  constructor(private readonly payments: StripePaymentService) {}

  onApplicationBootstrap(): void {
    this.interval = setInterval(
      () => void this.tick(),
      RECONCILIATION_INTERVAL_MS,
    );
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.payments.reconcileOutstanding();
    } catch (error) {
      this.logger.error(
        'Stripe reconciliation pass failed; durable work remains queued',
        error instanceof Error ? error.stack : undefined,
      );
    } finally {
      this.running = false;
    }
  }
}
