import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { WebhookEvent } from './entities/webhook-event.entity';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookProcessor } from './webhook.processor';
import { PaystackModule } from '../payments/paystack/paystack.module';
import { DepositsModule } from '../deposits/deposits.module';
import { WithdrawalsModule } from '../withdrawals/withdrawals.module';
import { WEBHOOK_PROCESSING_QUEUE } from '../queue/queue.constants';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEvent]),
    BullModule.registerQueue({ name: WEBHOOK_PROCESSING_QUEUE }),
    PaystackModule,
    DepositsModule,
    WithdrawalsModule,
  ],
  providers: [WebhooksService, WebhookProcessor],
  controllers: [WebhooksController],
})
export class WebhooksModule {}
