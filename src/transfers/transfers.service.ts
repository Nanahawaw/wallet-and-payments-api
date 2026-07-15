import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { TransferRequest, TransferStatus } from './entities/transfer-request.entity';
import { UsersService } from '../users/users.service';
import { WalletsService } from '../wallets/wallets.service';
import { LedgerEntryType } from '../wallets/entities/ledger-entry.entity';
import { InsufficientFundsException } from '../common/exceptions/insufficient-funds.exception';
import { generateReference } from '../common/utils/reference.util';

@Injectable()
export class TransfersService {
  constructor(
    @InjectRepository(TransferRequest) private readonly transferRepository: Repository<TransferRequest>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly usersService: UsersService,
    private readonly walletsService: WalletsService,
  ) {}

  async transfer(senderUserId: string, params: { recipientUsername: string; amount: number; idempotencyKey?: string }) {
    if (params.idempotencyKey) {
      const existing = await this.transferRepository.findOne({
        where: { idempotencyKey: params.idempotencyKey, senderUserId },
      });
      if (existing) {
        if (existing.status === TransferStatus.PROCESSING) {
          throw new ConflictException('An identical transfer request is already being processed');
        }
        return existing;
      }
    }

    const recipient = await this.usersService.findByUsername(params.recipientUsername);
    if (!recipient) throw new NotFoundException('Recipient not found');
    if (recipient.id === senderUserId) throw new BadRequestException('Cannot transfer to your own wallet');

    const [senderWallet, recipientWallet] = await Promise.all([
      this.walletsService.getByUserId(senderUserId),
      this.walletsService.getByUserId(recipient.id),
    ]);

    const reference = generateReference('trf');

    let transferRequest = this.transferRepository.create({
      senderUserId,
      recipientUserId: recipient.id,
      amount: params.amount,
      reference,
      idempotencyKey: params.idempotencyKey ?? null,
      status: TransferStatus.PROCESSING,
    });
    try {
      transferRequest = await this.transferRepository.save(transferRequest);
    } catch (err) {
      if (err instanceof QueryFailedError && (err as unknown as { code?: string }).code === '23505') {
        throw new ConflictException('An identical transfer request is already being processed');
      }
      throw err;
    }

    try {
      await this.dataSource.transaction(async (manager) => {
        // Lock wallets in a fixed global order (ascending id) regardless of debit/credit
        // direction, so two transfers moving money in opposite directions between the
        // same pair of wallets can never deadlock on each other's locks.
        const walletsInLockOrder = [senderWallet, recipientWallet].sort((a, b) => a.id.localeCompare(b.id));
        const isSenderFirst = walletsInLockOrder[0].id === senderWallet.id;

        const applyDebit = () =>
          this.walletsService.recordEntry(manager, {
            walletId: senderWallet.id,
            type: LedgerEntryType.TRANSFER_OUT,
            amount: params.amount,
            reference: `${reference}:out`,
            metadata: { counterpartyUserId: recipient.id, transferReference: reference },
          });
        const applyCredit = () =>
          this.walletsService.recordEntry(manager, {
            walletId: recipientWallet.id,
            type: LedgerEntryType.TRANSFER_IN,
            amount: params.amount,
            reference: `${reference}:in`,
            metadata: { counterpartyUserId: senderUserId, transferReference: reference },
          });

        if (isSenderFirst) {
          await applyDebit();
          await applyCredit();
        } else {
          await applyCredit();
          await applyDebit();
        }
      });
    } catch (err) {
      transferRequest.status = TransferStatus.FAILED;
      transferRequest.failureReason = err instanceof InsufficientFundsException ? 'Insufficient balance' : 'Transfer failed';
      await this.transferRepository.save(transferRequest);
      throw err;
    }

    transferRequest.status = TransferStatus.SUCCESS;
    await this.transferRepository.save(transferRequest);
    return transferRequest;
  }
}
