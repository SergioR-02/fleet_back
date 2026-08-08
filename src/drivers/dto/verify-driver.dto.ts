import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class VerifyDriverDto {
  @ApiProperty({ example: '1020304050', description: 'Cédula del conductor' })
  @IsString()
  @MinLength(5)
  document: string;

  @ApiProperty({
    example: '3001234567',
    description:
      'Celular del conductor (puede venir con indicativo, ej. 573001234567 desde WhatsApp)',
  })
  @IsString()
  @MinLength(7)
  phone: string;
}
