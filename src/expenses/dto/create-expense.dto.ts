import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseSource } from '@prisma/client';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateExpenseDto {
  @ApiProperty()
  @IsUUID()
  driverId: string;

  @ApiProperty({ example: '900123456-1' })
  @IsString()
  @MinLength(3)
  nit: string;

  @ApiProperty({ example: 'TERPEL' })
  @IsString()
  @MinLength(1)
  merchantName: string;

  @ApiProperty({ example: 85000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount: number;

  @ApiProperty({ example: '2026-08-08' })
  @IsDateString()
  expenseDate: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  invoiceNumber?: string;

  @ApiProperty({ enum: ExpenseSource, example: ExpenseSource.WHATSAPP })
  @IsEnum(ExpenseSource)
  source: ExpenseSource;

  @ApiPropertyOptional({
    description: 'Si true, crea aunque exista un posible duplicado',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  force?: boolean;
}
