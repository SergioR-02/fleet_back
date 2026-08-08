import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversQueryDto } from './dto/drivers-query.dto';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import { VerifyDriverDto } from './dto/verify-driver.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AllowApiKey } from '../common/decorators/allow-api-key.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { PaginationQueryDto } from '../common/dto/pagination.dto';

@ApiTags('Drivers')
@ApiBearerAuth()
@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Listar conductores' })
  findAll(@Query() query: DriversQueryDto) {
    return this.driversService.findAll(query);
  }

  /**
   * Endpoint principal para n8n:
   * valida cédula + celular (ambos obligatorios).
   */
  @Post('verify')
  @AllowApiKey()
  @Roles(UserRole.ADMIN)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Verificar conductor por cédula y celular (n8n / WhatsApp)',
    description:
      'Devuelve el conductor solo si cédula y celular coinciden y el estado es ACTIVE.',
  })
  verify(@Body() dto: VerifyDriverDto) {
    return this.driversService.verifyByDocumentAndPhone(
      dto.document,
      dto.phone,
    );
  }

  @Get('verify')
  @AllowApiKey()
  @Roles(UserRole.ADMIN)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Verificar conductor (GET) por query document + phone',
  })
  verifyGet(@Query() query: VerifyDriverDto) {
    return this.driversService.verifyByDocumentAndPhone(
      query.document,
      query.phone,
    );
  }

  @Get('document/:document')
  @AllowApiKey()
  @Roles(UserRole.ADMIN, UserRole.DRIVER)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Buscar conductor solo por cédula (legacy)',
    description:
      'Preferir POST /drivers/verify con cédula + celular desde n8n.',
  })
  findByDocument(@Param('document') document: string) {
    return this.driversService.findByDocument(document);
  }

  @Get('document/:document/expenses')
  @AllowApiKey()
  @Roles(UserRole.ADMIN, UserRole.DRIVER)
  @ApiSecurity('api-key')
  @ApiOperation({ summary: 'Gastos de un conductor por cédula' })
  findExpensesByDocument(
    @Param('document') document: string,
    @Query() query: PaginationQueryDto,
  ) {
    return this.driversService.findExpensesByDocument(
      document,
      query.page,
      query.limit,
    );
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DRIVER)
  @ApiOperation({ summary: 'Detalle de conductor' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    if (user.role === UserRole.DRIVER && user.driverId !== id) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.driversService.findOne(id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Crear conductor' })
  create(@Body() dto: CreateDriverDto, @CurrentUser() user: AuthUser) {
    return this.driversService.create(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar conductor' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.driversService.update(id, dto, user);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Activar / desactivar conductor' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDriverStatusDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.driversService.updateStatus(id, dto, user);
  }
}
