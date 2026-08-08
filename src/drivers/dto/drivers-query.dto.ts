import { ApiPropertyOptional } from '@nestjs/swagger';
import { DriverStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class DriversQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: 'Cédula, nombre o placa' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ enum: DriverStatus })
  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;
}
