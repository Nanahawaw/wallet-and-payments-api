import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';

export class InitiateDepositDto {
  @ApiProperty({ example: 500000, description: 'Amount in kobo (NGN minor units). 500000 = NGN 5,000.00' })
  @IsInt()
  @Min(100)
  amount: number;
}
