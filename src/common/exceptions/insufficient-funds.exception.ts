import { UnprocessableEntityException } from '@nestjs/common';

export class InsufficientFundsException extends UnprocessableEntityException {
  constructor() {
    super('Insufficient wallet balance');
  }
}
