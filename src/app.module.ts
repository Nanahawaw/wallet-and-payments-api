import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { User } from './users/entities/user.entity';
import { Wallet } from './wallets/entities/wallet.entity';
import { LedgerEntry } from './wallets/entities/ledger-entry.entity';
import { DepositRequest } from './deposits/entities/deposit-request.entity';
import { WebhookEvent } from './webhooks/entities/webhook-event.entity';
import { WithdrawalRequest } from './withdrawals/entities/withdrawal-request.entity';
import { TransferRequest } from './transfers/entities/transfer-request.entity';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { WalletsModule } from './wallets/wallets.module';
import { DepositsModule } from './deposits/deposits.module';
import { WithdrawalsModule } from './withdrawals/withdrawals.module';
import { TransfersModule } from './transfers/transfers.module';
import { WebhooksModule } from './webhooks/webhooks.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres' as const,
        url: configService.getOrThrow<string>('databaseUrl'),
        entities: [User, Wallet, LedgerEntry, DepositRequest, WebhookEvent, WithdrawalRequest, TransferRequest],
        synchronize: false,
        migrationsRun: true,
        migrations: [__dirname + '/database/migrations/*{.ts,.js}'],
        logging: configService.get('nodeEnv') === 'development' ? ['error', 'warn'] : ['error'],
      }),
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        connection: { url: configService.getOrThrow<string>('redisUrl') },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        throttlers: [
          {
            ttl: configService.getOrThrow<number>('throttle.ttlSeconds') * 1000,
            limit: configService.getOrThrow<number>('throttle.limit'),
          },
        ],
      }),
    }),
    UsersModule,
    AuthModule,
    WalletsModule,
    DepositsModule,
    WithdrawalsModule,
    TransfersModule,
    WebhooksModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
