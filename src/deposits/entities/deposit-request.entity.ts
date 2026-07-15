import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { BigIntTransformer } from '../../common/transformers/bigint.transformer';

export enum DepositStatus {
  PENDING = 'PENDING',
  SUCCESS = 'SUCCESS',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED',
}

/** One row per deposit attempt initiated by a user, before provider confirmation. */
@Entity('deposit_requests')
export class DepositRequest {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Index()
  @Column({ name: 'wallet_id', type: 'uuid' })
  walletId: string;

  /** Sent to Paystack as `reference`; also our idempotency key for crediting. */
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 100 })
  reference: string;

  @Column({ type: 'bigint', transformer: BigIntTransformer })
  amount: number;

  @Column({ type: 'varchar', length: 20, default: 'paystack' })
  provider: string;

  @Column({ type: 'enum', enum: DepositStatus, default: DepositStatus.PENDING })
  status: DepositStatus;

  @Column({ name: 'provider_reference', type: 'varchar', nullable: true })
  providerReference: string | null;

  @Column({ name: 'authorization_url', type: 'varchar', nullable: true })
  authorizationUrl: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
