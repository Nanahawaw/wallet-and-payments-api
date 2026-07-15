import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DataSource, Repository } from 'typeorm';
import { WithdrawalRequest, WithdrawalStatus } from './entities/withdrawal-request.entity';
import { WalletsService } from '../wallets/wallets.service';
import { PaystackService } from '../payments/paystack/paystack.service';
import { LedgerEntryType } from '../wallets/entities/ledger-entry.entity';
import { generateReference } from '../common/utils/reference.util';
import { WITHDRAWAL_PROCESSING_QUEUE } from '../queue/queue.constants';

@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);

  constructor(
    @InjectRepository(WithdrawalRequest) private readonly withdrawalRepository: Repository<WithdrawalRequest>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly walletsService: WalletsService,
    private readonly paystackService: PaystackService,
    @InjectQueue(WITHDRAWAL_PROCESSING_QUEUE) private readonly queue: Queue,
  ) {}

  /**
   * Reserves the funds synchronously (locked debit, same as any other ledger
   * movement) so a concurrent second withdrawal against the same balance sees
   * the reduced balance immediately. The actual bank payout is dispatched to a
   * background job since it's a slow external call that can fail and retry.
   */
  async initiate(userId: string, params: { amount: number; bankCode: string; accountNumber: string }) {
    const wallet = await this.walletsService.getByUserId(userId);
    const resolved = await this.paystackService.resolveAccount({
      accountNumber: params.accountNumber,
      bankCode: params.bankCode,
    });

    const reference = generateReference('wd');

    const withdrawalRequest = await this.dataSource.transaction(async (manager) => {
      await this.walletsService.recordEntry(manager, {
        walletId: wallet.id,
        type: LedgerEntryType.WITHDRAWAL,
        amount: params.amount,
        reference,
        metadata: { bankCode: params.bankCode, accountNumber: params.accountNumber },
      });

      const repo = manager.getRepository(WithdrawalRequest);
      const record = repo.create({
        userId,
        walletId: wallet.id,
        amount: params.amount,
        bankCode: params.bankCode,
        accountNumber: params.accountNumber,
        accountName: resolved.accountName,
        reference,
        status: WithdrawalStatus.PROCESSING,
      });
      return repo.save(record);
    });

    try {
      await this.queue.add(
        'process-withdrawal',
        { withdrawalRequestId: withdrawalRequest.id },
        { attempts: 5, backoff: { type: 'exponential', delay: 5000 } },
      );
    } catch (err) {
      this.logger.error(`Failed to enqueue withdrawal ${withdrawalRequest.id}, reversing: ${(err as Error).message}`);
      await this.reverse(withdrawalRequest.id, 'Failed to schedule payout');
      withdrawalRequest.status = WithdrawalStatus.FAILED;
      withdrawalRequest.failureReason = 'Failed to schedule payout';
    }

    return withdrawalRequest;
  }

  async getStatus(id: string, userId: string) {
    return this.withdrawalRepository.findOne({ where: { id, userId } });
  }

  /** Credits the wallet back and marks the withdrawal FAILED. Idempotent: no-ops if the request is no longer PROCESSING. */
  async reverse(withdrawalRequestId: string, reason: string) {
    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(WithdrawalRequest);
      const withdrawalRequest = await repo.findOne({
        where: { id: withdrawalRequestId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!withdrawalRequest || withdrawalRequest.status !== WithdrawalStatus.PROCESSING) return;

      await this.walletsService.recordEntry(manager, {
        walletId: withdrawalRequest.walletId,
        type: LedgerEntryType.WITHDRAWAL_REVERSAL,
        amount: withdrawalRequest.amount,
        reference: `${withdrawalRequest.reference}:reversal`,
        metadata: { reason },
      });

      withdrawalRequest.status = WithdrawalStatus.FAILED;
      withdrawalRequest.failureReason = reason;
      await repo.save(withdrawalRequest);
    });
  }

  /** Marks a withdrawal SUCCESS/FAILED from a provider webhook. Idempotent via row lock + status check. */
  async finalizeFromWebhook(params: { reference: string; outcome: 'success' | 'failed' | 'reversed'; providerRef: string }) {
    if (params.outcome !== 'success') {
      await this.reverse((await this.findByReferenceOrThrow(params.reference)).id, `Provider reported ${params.outcome}`);
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const repo = manager.getRepository(WithdrawalRequest);
      const withdrawalRequest = await repo.findOne({
        where: { reference: params.reference },
        lock: { mode: 'pessimistic_write' },
      });
      if (!withdrawalRequest || withdrawalRequest.status !== WithdrawalStatus.PROCESSING) return;

      withdrawalRequest.status = WithdrawalStatus.SUCCESS;
      withdrawalRequest.providerReference = params.providerRef;
      await repo.save(withdrawalRequest);
    });
  }

  private async findByReferenceOrThrow(reference: string): Promise<WithdrawalRequest> {
    const record = await this.withdrawalRepository.findOne({ where: { reference } });
    if (!record) throw new Error(`Withdrawal with reference ${reference} not found`);
    return record;
  }
}
