import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { BigIntTransformer } from '../../common/transformers/bigint.transformer';

export enum LedgerEntryType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  WITHDRAWAL_REVERSAL = 'WITHDRAWAL_REVERSAL',
  TRANSFER_IN = 'TRANSFER_IN',
  TRANSFER_OUT = 'TRANSFER_OUT',
}

/**
 * Append-only. A row is written only in the same DB transaction that mutates
 * the wallet balance, so the sum of entries for a wallet always reconciles
 * with wallet.balance. Nothing is ever updated or deleted here.
 */
@Entity('ledger_entries')
export class LedgerEntry {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  @Column({ type: 'enum', enum: LedgerEntryType })
  type: LedgerEntryType;

  /** Always positive; direction is implied by `type`. */
  @Column({ type: 'bigint', transformer: BigIntTransformer })
  amount: number;

  /** Wallet balance immediately after this entry was applied, for cheap auditing. */
  @Column({ name: 'balance_after', type: 'bigint', transformer: BigIntTransformer })
  balanceAfter: number;

  /** Idempotency/business key, e.g. deposit reference, withdrawal reference, transfer reference. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  reference: string;

  /** Links the two legs of a transfer, or a reversal entry to the entry it reverses. */
  @Column({ name: 'related_entry_id', type: 'uuid', nullable: true })
  relatedEntryId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
