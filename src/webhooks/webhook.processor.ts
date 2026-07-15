import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { WebhookEvent } from './entities/webhook-event.entity';
import { DepositsService } from '../deposits/deposits.service';
import { WithdrawalsService } from '../withdrawals/withdrawals.service';
import { WEBHOOK_PROCESSING_QUEUE } from '../queue/queue.constants';

@Injectable()
@Processor(WEBHOOK_PROCESSING_QUEUE)
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(
    @InjectRepository(WebhookEvent) private readonly webhookEventRepository: Repository<WebhookEvent>,
    private readonly depositsService: DepositsService,
    private readonly withdrawalsService: WithdrawalsService,
  ) {
    super();
  }

  async process(job: Job<{ webhookEventId: string }>): Promise<void> {
    const webhookEvent = await this.webhookEventRepository.findOne({ where: { id: job.data.webhookEventId } });
    if (!webhookEvent) return;
    if (webhookEvent.processedAt) return; // already handled, defensive no-op

    const payload = webhookEvent.payload as { data?: Record<string, unknown> };
    const data = payload.data ?? {};

    try {
      switch (webhookEvent.eventType) {
        case 'charge.success':
          await this.depositsService.confirmDeposit({
            reference: String(data.reference),
            providerStatus: 'success',
            amountKobo: Number(data.amount),
            providerRef: String(data.id),
          });
          break;
        case 'transfer.success':
          await this.withdrawalsService.finalizeFromWebhook({
            reference: String(data.reference),
            outcome: 'success',
            providerRef: String(data.id),
          });
          break;
        case 'transfer.failed':
          await this.withdrawalsService.finalizeFromWebhook({
            reference: String(data.reference),
            outcome: 'failed',
            providerRef: String(data.id),
          });
          break;
        case 'transfer.reversed':
          await this.withdrawalsService.finalizeFromWebhook({
            reference: String(data.reference),
            outcome: 'reversed',
            providerRef: String(data.id),
          });
          break;
        default:
          this.logger.log(`Unhandled webhook event type: ${webhookEvent.eventType}`);
      }

      webhookEvent.processedAt = new Date();
      webhookEvent.processingError = null;
      await this.webhookEventRepository.save(webhookEvent);
    } catch (err) {
      webhookEvent.processingError = (err as Error).message;
      await this.webhookEventRepository.save(webhookEvent);
      throw err;
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Webhook job ${job.id} failed: ${error.message}`);
  }
}
