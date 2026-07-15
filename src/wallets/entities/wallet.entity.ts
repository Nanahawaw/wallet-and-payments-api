import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { BigIntTransformer } from '../../common/transformers/bigint.transformer';

@Entity('wallets')
@Check('CHK_wallet_balance_non_negative', '"balance" >= 0')
export class Wallet {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @OneToOne(() => User, (user) => user.wallet)
  @JoinColumn({ name: 'user_id' })
  user: User;

  /** Balance in minor units (kobo). Never mutated outside a locked transaction. */
  @Column({ type: 'bigint', default: 0, transformer: BigIntTransformer })
  balance: number;

  @Column({ type: 'varchar', length: 3, default: 'NGN' })
  currency: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
