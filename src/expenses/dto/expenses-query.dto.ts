import { ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export const EXPENSE_SORT_FIELDS = [
  'merchantName',
  'expenseDate',
  'amount',
  'createdAt',
] as const;

export type ExpenseSortField = (typeof EXPENSE_SORT_FIELDS)[number];

export class ExpensesQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  driverId?: string;

  /**
   * n8n / API Key: cédula + celular obligatorios para acotar al conductor
   * de la conversación (evita listar toda la flota con la API Key).
   */
  @ApiPropertyOptional({
    description: 'Cédula (requerida con API Key junto a phone)',
  })
  @IsOptional()
  @IsString()
  @MinLength(5)
  document?: string;

  @ApiPropertyOptional({
    description: 'Celular (requerido con API Key junto a document)',
  })
  @IsOptional()
  @IsString()
  @MinLength(7)
  phone?: string;

  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  merchant?: string;

  @ApiPropertyOptional({ example: '2026-01-01' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({
    enum: EXPENSE_SORT_FIELDS,
    description: 'Campo de orden (default expenseDate)',
  })
  @IsOptional()
  @IsIn([...EXPENSE_SORT_FIELDS])
  sortBy?: ExpenseSortField;

  @ApiPropertyOptional({
    enum: ['asc', 'desc'],
    description: 'Dirección de orden (default desc)',
  })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc';
}
