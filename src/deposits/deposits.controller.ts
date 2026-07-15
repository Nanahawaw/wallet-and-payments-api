import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/interfaces/authenticated-user.interface';
import { DepositsService } from './deposits.service';
import { InitiateDepositDto } from './dto/initiate-deposit.dto';

@ApiTags('deposits')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('deposits')
export class DepositsController {
  constructor(private readonly depositsService: DepositsService) {}

  @Post()
  @ApiOperation({ summary: 'Initiate a deposit; returns a Paystack checkout URL. Wallet is credited only after webhook confirmation.' })
  initiate(@CurrentUser() user: AuthenticatedUser, @Body() dto: InitiateDepositDto) {
    return this.depositsService.initiate(user.userId, dto.amount);
  }

  @Get(':reference')
  @ApiOperation({ summary: 'Check the status of a deposit by reference' })
  getStatus(@CurrentUser() user: AuthenticatedUser, @Param('reference') reference: string) {
    return this.depositsService.getStatus(reference, user.userId);
  }
}
