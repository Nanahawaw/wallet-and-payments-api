import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QueryFailedError, Repository } from 'typeorm';
import { WebhookEvent } from './entities/webhook-event.entity';
import { PaystackService } from '../payments/paystack/paystack.service';
import { WEBHOOK_PROCESSING_QUEUE } from '../queue/queue.constants';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(WebhookEvent) private readonly webhookEventRepository: Repository<WebhookEvent>,
    private readonly paystackService: PaystackService,
    @InjectQueue(WEBHOOK_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Fast-acks the provider (Paystack retries aggressively if it doesn't get a
   * quick 200). The unique index on `dedupe_key` is what actually stops a
   * duplicate delivery from being processed twice - a second delivery hits a
   * constraint violation here and returns immediately without ever reaching
   * the queue, regardless of what the processor does downstream.
   */
  async handlePaystackWebhook(rawBody: Buffer | undefined, body: Record<string, unknown>, signature: string | undefined) {
    if (!rawBody || !this.paystackService.verifyWebhookSignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const eventType = String(body.event ?? 'unknown');
    const data = (body.data ?? {}) as Record<string, unknown>;
    const dedupeKey = `paystack:${data.id ?? data.reference}:${eventType}`;

    const webhookEvent = this.webhookEventRepository.create({
      provider: 'paystack',
      eventType,
      dedupeKey,
      payload: body,
    });

    try {
      await this.webhookEventRepository.save(webhookEvent);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as unknown as { code?: string }).code === '23505') {
        this.logger.log(`Duplicate webhook delivery ignored: ${dedupeKey}`);
        return { received: true, duplicate: true };
      }
      throw err;
    }

    await this.queue.add('process-webhook', { webhookEventId: webhookEvent.id }, { attempts: 5, backoff: { type: 'exponential', delay: 3000 } });
    return { received: true };
  }
}
