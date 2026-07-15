import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BigIntTransformer } from '../../common/transformers/bigint.transformer';

export enum WithdrawalStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

@Entity('withdrawal_requests')
export class WithdrawalRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Index()
  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  @Column({ type: 'bigint', transformer: BigIntTransformer })
  amount: number;

  @Column({ name: 'bank_code', type: 'varchar', length: 20 })
  bankCode: string;

  @Column({ name: 'account_number', type: 'varchar', length: 20 })
  accountNumber: string;

  @Column({ name: 'account_name', type: 'varchar', nullable: true })
  accountName: string | null;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  reference: string;

  /** Client-supplied Idempotency-Key header, if any; guards against accidental double-submit. */
  @Index({ unique: true, where: '"idempotency_key" IS NOT NULL' })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'enum', enum: WithdrawalStatus, default: WithdrawalStatus.PENDING })
  status: WithdrawalStatus;

  @Column({ name: 'provider_reference', type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
