import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { WalletsService } from './wallets.service';
import { LedgerEntry } from './entities/ledger-entry.entity';

@ApiTags('wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    @InjectRepository(LedgerEntry) private readonly ledgerRepository: Repository<LedgerEntry>,
  ) {}

  @Get('me')
  @ApiOperation({ summary: "Get the current user's wallet balance" })
  async getMyWallet(@CurrentUser() user: AuthenticatedUser) {
    const wallet = await this.walletsService.getByUserId(user.userId);
    return {
      walletId: wallet.id,
      balance: wallet.balance,
      currency: wallet.currency,
    };
  }

  @Get('me/transactions')
  @ApiOperation({ summary: "List the current user's ledger entries, newest first" })
  async getMyTransactions(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    const wallet = await this.walletsService.getByUserId(user.userId);
    const [entries, total] = await this.ledgerRepository.findAndCount({
      where: { walletId: wallet.id },
      order: { createdAt: 'DESC' },
      take: Math.min(parseInt(limit, 10) || 50, 100),
      skip: parseInt(offset, 10) || 0,
    });
    return { total, entries };
  }
}
