import { Logger, Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule, InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { DepositRequest } from './entities/deposit-request.entity';
import { DepositsService } from './deposits.service';
import { DepositsController } from './deposits.controller';
import { DepositReconciliationProcessor } from './deposit-reconciliation.processor';
import { WalletsModule } from '../wallets/wallets.module';
import { UsersModule } from '../users/users.module';
import { PaystackModule } from '../payments/paystack/paystack.module';
import {
  DEPOSIT_RECONCILIATION_JOB,
  DEPOSIT_RECONCILIATION_QUEUE,
  DEPOSIT_RECONCILIATION_REPEAT_MS,
} from '../queue/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([DepositRequest]),
    BullModule.registerQueue({ name: DEPOSIT_RECONCILIATION_QUEUE }),
    WalletsModule,
    UsersModule,
    PaystackModule,
  ],
  providers: [DepositsService, DepositReconciliationProcessor],
  controllers: [DepositsController],
  exports: [DepositsService],
})
export class DepositsModule implements OnModuleInit {
  private readonly logger = new Logger(DepositsModule.name);

  constructor(@InjectQueue(DEPOSIT_RECONCILIATION_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    await this.queue.upsertJobScheduler(
      DEPOSIT_RECONCILIATION_JOB,
      { every: DEPOSIT_RECONCILIATION_REPEAT_MS },
      { name: DEPOSIT_RECONCILIATION_JOB },
    );
    this.logger.log(`Scheduled deposit reconciliation sweep every ${DEPOSIT_RECONCILIATION_REPEAT_MS / 1000}s`);
  }
}
