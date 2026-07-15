import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Wallet } from './entities/wallet.entity';
import { LedgerEntry, LedgerEntryType } from './entities/ledger-entry.entity';
import { InsufficientFundsException } from '../common/exceptions/insufficient-funds.exception';

const CREDIT_TYPES = new Set([
  LedgerEntryType.DEPOSIT,
  LedgerEntryType.TRANSFER_IN,
  LedgerEntryType.WITHDRAWAL_REVERSAL,
]);

export interface RecordEntryParams {
  walletId: string;
  type: LedgerEntryType;
  amount: number;
  reference: string;
  relatedEntryId?: string | null;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(Wallet) private readonly walletsRepository: Repository<Wallet>,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async createForUser(userId: string, manager?: EntityManager): Promise<Wallet> {
    const repo = manager ? manager.getRepository(Wallet) : this.walletsRepository;
    const wallet = repo.create({ userId, balance: 0, currency: 'NGN' });
    return repo.save(wallet);
  }

  async getByUserId(userId: string): Promise<Wallet> {
    const wallet = await this.walletsRepository.findOne({ where: { userId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  runInTransaction<T>(work: (manager: EntityManager) => Promise<T>): Promise<T> {
    return this.dataSource.transaction(work);
  }

  /** Must be called inside an existing transaction (`manager` from runInTransaction). Blocks concurrent lockers until commit. */
  async lockWallet(manager: EntityManager, walletId: string): Promise<Wallet> {
    const wallet = await manager.findOne(Wallet, {
      where: { id: walletId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  /**
   * Locks the wallet, applies a single ledger movement atomically, and returns the
   * updated wallet + entry. `reference` must be unique per movement (enforced by a
   * DB unique index) so retried/duplicated calls with the same reference fail
   * loudly instead of double-applying.
   */
  async recordEntry(manager: EntityManager, params: RecordEntryParams): Promise<{ wallet: Wallet; entry: LedgerEntry }> {
    const wallet = await this.lockWallet(manager, params.walletId);
    const isCredit = CREDIT_TYPES.has(params.type);
    const newBalance = isCredit ? wallet.balance + params.amount : wallet.balance - params.amount;

    if (newBalance < 0) {
      throw new InsufficientFundsException();
    }

    wallet.balance = newBalance;
    await manager.save(Wallet, wallet);

    const entry = manager.create(LedgerEntry, {
      walletId: wallet.id,
      type: params.type,
      amount: params.amount,
      balanceAfter: newBalance,
      reference: params.reference,
      relatedEntryId: params.relatedEntryId ?? null,
      metadata: params.metadata ?? null,
    });
    const savedEntry = await manager.save(LedgerEntry, entry);

    return { wallet, entry: savedEntry };
  }
}
