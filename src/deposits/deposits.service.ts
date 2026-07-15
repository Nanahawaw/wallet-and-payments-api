import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, LessThan, Repository } from 'typeorm';
import { DepositRequest, DepositStatus } from './entities/deposit-request.entity';
import { WalletsService } from '../wallets/wallets.service';
import { UsersService } from '../users/users.service';
import { PaystackInitializeResult, PaystackService } from '../payments/paystack/paystack.service';
import { LedgerEntryType } from '../wallets/entities/ledger-entry.entity';
import { generateReference } from '../common/utils/reference.util';

@Injectable()
export class DepositsService {
  private readonly logger = new Logger(DepositsService.name);

  constructor(
    @InjectRepository(DepositRequest) private readonly depositRepository: Repository<DepositRequest>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly walletsService: WalletsService,
    private readonly usersService: UsersService,
    private readonly paystackService: PaystackService,
    private readonly configService: ConfigService,
  ) {}

  async initiate(userId: string, amountKobo: number) {
    const [user, wallet] = await Promise.all([
      this.usersService.findById(userId),
      this.walletsService.getByUserId(userId),
    ]);
    if (!user) throw new NotFoundException('User not found');

    const reference = generateReference('dep');
    const expiryMinutes = this.configService.get<number>('depositExpiryMinutes', 30);
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000);

    const depositRequest = this.depositRepository.create({
      userId,
      walletId: wallet.id,
      reference,
      amount: amountKobo,
      status: DepositStatus.PENDING,
      expiresAt,
    });
    await this.depositRepository.save(depositRequest);

    let paystackResult: PaystackInitializeResult;
    try {
      paystackResult = await this.paystackService.initializeTransaction({
        email: user.email,
        amountKobo,
        reference,
        callbackUrl: `${this.configService.get<string>('appBaseUrl')}/deposits/callback`,
      });
    } catch (err) {
      depositRequest.status = DepositStatus.FAILED;
      await this.depositRepository.save(depositRequest);
      throw err;
    }

    depositRequest.authorizationUrl = paystackResult.authorizationUrl;
    await this.depositRepository.save(depositRequest);

    return {
      reference,
      authorizationUrl: paystackResult.authorizationUrl,
      amount: amountKobo,
      status: depositRequest.status,
      expiresAt,
    };
  }

  async getStatus(reference: string, userId: string) {
    const depositRequest = await this.depositRepository.findOne({ where: { reference, userId } });
    if (!depositRequest) throw new NotFoundException('Deposit not found');
    return depositRequest;
  }

  /**
   * Idempotent by construction: locks the deposit_requests row first (blocks a
   * concurrent duplicate call for the same reference), then bails out unless the
   * request is still PENDING, so a second delivery of the same webhook - or a
   * reconciliation sweep racing a webhook - never credits the wallet twice.
   */
  async confirmDeposit(params: { reference: string; providerStatus: string; amountKobo: number; providerRef: string }) {
    await this.dataSource.transaction(async (manager) => {
      const depositRepo = manager.getRepository(DepositRequest);
      const depositRequest = await depositRepo.findOne({
        where: { reference: params.reference },
        lock: { mode: 'pessimistic_write' },
      });

      if (!depositRequest) {
        this.logger.warn(`Webhook for unknown deposit reference ${params.reference}`);
        return;
      }
      if (depositRequest.status !== DepositStatus.PENDING) {
        this.logger.log(`Deposit ${params.reference} already ${depositRequest.status}, ignoring duplicate confirmation`);
        return;
      }

      if (params.providerStatus !== 'success') {
        depositRequest.status = DepositStatus.FAILED;
        depositRequest.providerReference = params.providerRef;
        await depositRepo.save(depositRequest);
        return;
      }

      if (params.amountKobo !== depositRequest.amount) {
        this.logger.error(
          `Amount mismatch for deposit ${params.reference}: expected ${depositRequest.amount}, provider sent ${params.amountKobo}`,
        );
        depositRequest.status = DepositStatus.FAILED;
        depositRequest.providerReference = params.providerRef;
        await depositRepo.save(depositRequest);
        return;
      }

      await this.walletsService.recordEntry(manager, {
        walletId: depositRequest.walletId,
        type: LedgerEntryType.DEPOSIT,
        amount: depositRequest.amount,
        reference: depositRequest.reference,
        metadata: { provider: 'paystack', providerReference: params.providerRef },
      });

      depositRequest.status = DepositStatus.SUCCESS;
      depositRequest.providerReference = params.providerRef;
      await depositRepo.save(depositRequest);
    });
  }

  /** Sweeps deposits past their expiry: re-checks with Paystack in case a webhook was missed, otherwise marks EXPIRED. Never touches the wallet on the expiry path. */
  async sweepExpiredDeposits(): Promise<{ checked: number; confirmed: number; expired: number }> {
    const stale = await this.depositRepository.find({
      where: { status: DepositStatus.PENDING, expiresAt: LessThan(new Date()) },
      take: 100,
    });

    let confirmed = 0;
    let expired = 0;

    for (const depositRequest of stale) {
      try {
        const verification = await this.paystackService.verifyTransaction(depositRequest.reference);
        if (verification.status === 'success') {
          await this.confirmDeposit({
            reference: depositRequest.reference,
            providerStatus: 'success',
            amountKobo: verification.amount,
            providerRef: String(verification.id),
          });
          confirmed++;
          continue;
        }
      } catch (err) {
        this.logger.error(`Failed to verify stale deposit ${depositRequest.reference}: ${(err as Error).message}`);
      }

      await this.dataSource.transaction(async (manager) => {
        const depositRepo = manager.getRepository(DepositRequest);
        const locked = await depositRepo.findOne({
          where: { id: depositRequest.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (locked && locked.status === DepositStatus.PENDING) {
          locked.status = DepositStatus.EXPIRED;
          await depositRepo.save(locked);
        }
      });
      expired++;
    }

    return { checked: stale.length, confirmed, expired };
  }
}
