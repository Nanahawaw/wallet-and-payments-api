import 'dotenv/config';
import { DataSource } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Wallet } from '../wallets/entities/wallet.entity';
import { LedgerEntry } from '../wallets/entities/ledger-entry.entity';
import { DepositRequest } from '../deposits/entities/deposit-request.entity';
import { WebhookEvent } from '../webhooks/entities/webhook-event.entity';
import { WithdrawalRequest } from '../withdrawals/entities/withdrawal-request.entity';
import { TransferRequest } from '../transfers/entities/transfer-request.entity';

/** Used by the TypeORM CLI to generate/run migrations. The running app gets its config via AppModule/TypeOrmModule instead. */
export const AppDataSource = new DataSource({
  type: 'postgres',
  url: process.env.DATABASE_URL,
  entities: [User, Wallet, LedgerEntry, DepositRequest, WebhookEvent, WithdrawalRequest, TransferRequest],
  migrations: ['src/database/migrations/*.ts'],
  synchronize: false,
  logging: false,
});
