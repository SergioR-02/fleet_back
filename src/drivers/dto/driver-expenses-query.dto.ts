import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExpenseStatus } from '@prisma/client';
import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

/**
 * Listado de gastos del conductor para n8n.
 * Exige cédula (path o query) + celular; filtros opcionales de la spec.
 */
export class DriverExpensesQueryDto extends PaginationQueryDto {
  @ApiProperty({
    example: '3001234567',
    description:
      'Celular del conductor (obligatorio con API Key; cierra el oráculo de solo-cédula)',
  })
  @IsString()
  @MinLength(7)
  phone: string;

  @ApiPropertyOptional({ enum: ExpenseStatus })
  @IsOptional()
  @IsEnum(ExpenseStatus)
  status?: ExpenseStatus;

  @ApiPropertyOptional({ description: 'Filtra por nombre de comercio (parcial)' })
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
}
