import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsString, Min } from 'class-validator';

export class CreateTransferDto {
  @ApiProperty({ example: 'jane_doe', description: 'Recipient username on the platform' })
  @IsString()
  recipientUsername: string;

  @ApiProperty({ example: 250000, description: 'Amount in kobo (NGN minor units)' })
  @IsInt()
  @Min(100)
  amount: number;
}
