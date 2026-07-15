import { Logger } from '@nestjs/common';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { DEPOSIT_RECONCILIATION_QUEUE } from '../queue/queue.constants';
import { DepositsService } from './deposits.service';

@Processor(DEPOSIT_RECONCILIATION_QUEUE)
export class DepositReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(DepositReconciliationProcessor.name);

  constructor(private readonly depositsService: DepositsService) {
    super();
  }

  async process(_job: Job): Promise<void> {
    const result = await this.depositsService.sweepExpiredDeposits();
    if (result.checked > 0) {
      this.logger.log(
        `Reconciliation sweep: checked=${result.checked} confirmed=${result.confirmed} expired=${result.expired}`,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Reconciliation job ${job.id} failed: ${error.message}`);
  }
}
