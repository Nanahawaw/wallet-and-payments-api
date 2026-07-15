import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Repository } from 'typeorm';
import { WithdrawalRequest, WithdrawalStatus } from './entities/withdrawal-request.entity';
import { WithdrawalsService } from './withdrawals.service';
import { PaystackService } from '../payments/paystack/paystack.service';
import { WITHDRAWAL_PROCESSING_QUEUE } from '../queue/queue.constants';

@Injectable()
@Processor(WITHDRAWAL_PROCESSING_QUEUE)
export class WithdrawalProcessor extends WorkerHost {
  private readonly logger = new Logger(WithdrawalProcessor.name);

  constructor(
    @InjectRepository(WithdrawalRequest) private readonly withdrawalRepository: Repository<WithdrawalRequest>,
    private readonly withdrawalsService: WithdrawalsService,
    private readonly paystackService: PaystackService,
  ) {
    super();
  }

  async process(job: Job<{ withdrawalRequestId: string }>): Promise<void> {
    const withdrawalRequest = await this.withdrawalRepository.findOne({
      where: { id: job.data.withdrawalRequestId },
    });
    if (!withdrawalRequest || withdrawalRequest.status !== WithdrawalStatus.PROCESSING) {
      return;
    }

    try {
      const recipient = await this.paystackService.createTransferRecipient({
        name: withdrawalRequest.accountName ?? 'Wallet withdrawal',
        accountNumber: withdrawalRequest.accountNumber,
        bankCode: withdrawalRequest.bankCode,
      });
      const transfer = await this.paystackService.initiateTransfer({
        amountKobo: withdrawalRequest.amount,
        recipientCode: recipient.recipientCode,
        reference: withdrawalRequest.reference,
        reason: 'Wallet withdrawal',
      });

      if (transfer.status === 'success') {
        await this.withdrawalsService.finalizeFromWebhook({
          reference: withdrawalRequest.reference,
          outcome: 'success',
          providerRef: transfer.transferCode,
        });
      }
      // Otherwise Paystack settles it async; the transfer.success/transfer.failed webhook finalizes it later.
    } catch (err) {
      const attempts = job.opts.attempts ?? 1;
      const isLastAttempt = job.attemptsMade + 1 >= attempts;
      this.logger.error(
        `Withdrawal ${withdrawalRequest.reference} attempt ${job.attemptsMade + 1}/${attempts} failed: ${(err as Error).message}`,
      );
      if (!isLastAttempt) {
        throw err; // let BullMQ retry with backoff
      }
      await this.withdrawalsService.reverse(withdrawalRequest.id, 'Payout provider request failed after retries');
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    const attempts = job.opts.attempts ?? 1;
    const exhausted = job.attemptsMade >= attempts;
    this.logger.error(
      `Withdrawal job ${job.id} attempt ${job.attemptsMade}/${attempts} failed${exhausted ? ' (retries exhausted, reversed)' : ', will retry'}: ${error.message}`,
    );
  }
}
