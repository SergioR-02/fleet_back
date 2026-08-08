import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DriverStatus } from '@prisma/client';
import {
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateDriverDto {
  @ApiProperty({ example: '1020304050' })
  @IsString()
  @MinLength(5)
  document: string;

  @ApiProperty({ example: 'Carlos Gómez' })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: '3001234567' })
  @IsString()
  @MinLength(7)
  phone: string;

  @ApiPropertyOptional({ example: 'carlos@email.com' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'ABC123' })
  @IsOptional()
  @IsString()
  plate?: string;

  @ApiPropertyOptional({ enum: DriverStatus })
  @IsOptional()
  @IsEnum(DriverStatus)
  status?: DriverStatus;
}
