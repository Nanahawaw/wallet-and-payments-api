import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransferRequest } from './entities/transfer-request.entity';
import { TransfersService } from './transfers.service';
import { TransfersController } from './transfers.controller';
import { UsersModule } from '../users/users.module';
import { WalletsModule } from '../wallets/wallets.module';

@Module({
  imports: [TypeOrmModule.forFeature([TransferRequest]), UsersModule, WalletsModule],
  providers: [TransfersService],
  controllers: [TransfersController],
})
export class TransfersModule {}
