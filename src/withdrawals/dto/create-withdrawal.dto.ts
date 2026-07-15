import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Length, Min } from 'class-validator';

export class CreateWithdrawalDto {
  @ApiProperty({ example: 300000, description: 'Amount in kobo (NGN minor units)' })
  @IsInt()
  @Min(100)
  amount: number;

  @ApiProperty({ example: '058', description: "Paystack bank code, e.g. from GET /withdrawals/banks" })
  @IsString()
  bankCode: string;

  @ApiProperty({ example: '0123456789' })
  @IsString()
  @Length(10, 10)
  accountNumber: string;
}
