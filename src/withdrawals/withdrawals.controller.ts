import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { WithdrawalsService } from './withdrawals.service';
import { CreateWithdrawalDto } from './dto/create-withdrawal.dto';
import { PaystackService } from '../payments/paystack/paystack.service';

@ApiTags('withdrawals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('withdrawals')
export class WithdrawalsController {
  constructor(
    private readonly withdrawalsService: WithdrawalsService,
    private readonly paystackService: PaystackService,
  ) {}

  @Get('banks')
  @ApiOperation({ summary: 'List supported Nigerian banks and their Paystack bank codes' })
  listBanks() {
    return this.paystackService.listBanks();
  }

  @Post()
  @ApiOperation({ summary: 'Withdraw funds to a bank account; funds are reserved immediately, payout happens async' })
  initiate(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateWithdrawalDto) {
    return this.withdrawalsService.initiate(user.userId, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Check the status of a withdrawal by id' })
  async getStatus(@CurrentUser() user: AuthenticatedUser, @Param('id', new ParseUUIDPipe()) id: string) {
    const record = await this.withdrawalsService.getStatus(id, user.userId);
    if (!record) throw new NotFoundException('Withdrawal not found');
    return record;
  }
}
