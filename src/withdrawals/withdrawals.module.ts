import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WithdrawalRequest } from './entities/withdrawal-request.entity';
import { WithdrawalsService } from './withdrawals.service';
import { WithdrawalsController } from './withdrawals.controller';
import { WithdrawalProcessor } from './withdrawal.processor';
import { WalletsModule } from '../wallets/wallets.module';
import { PaystackModule } from '../payments/paystack/paystack.module';
import { WITHDRAWAL_PROCESSING_QUEUE } from '../queue/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([WithdrawalRequest]),
    BullModule.registerQueue({ name: WITHDRAWAL_PROCESSING_QUEUE }),
    WalletsModule,
    PaystackModule,
  ],
  providers: [WithdrawalsService, WithdrawalProcessor],
  controllers: [WithdrawalsController],
  exports: [WithdrawalsService],
})
export class WithdrawalsModule {}
