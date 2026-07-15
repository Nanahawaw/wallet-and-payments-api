import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BigIntTransformer } from '../../common/transformers/bigint.transformer';

export enum TransferStatus {
  PROCESSING = 'PROCESSING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
}

/** Wallet-to-wallet transfers settle synchronously (no external call needed), so this is a record, not a queue. */
@Entity('transfer_requests')
export class TransferRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'sender_user_id', type: 'uuid' })
  senderUserId: string;

  @Index()
  @Column({ name: 'recipient_user_id', type: 'uuid' })
  recipientUserId: string;

  @Column({ type: 'bigint', transformer: BigIntTransformer })
  amount: number;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  reference: string;

  @Index({ unique: true, where: '"idempotency_key" IS NOT NULL' })
  @Column({ name: 'idempotency_key', type: 'varchar', length: 100, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'enum', enum: TransferStatus })
  status: TransferStatus;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
