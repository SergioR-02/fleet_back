import {
  Body,
  Controller,
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
import { ExpensesService } from './expenses.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesQueryDto } from './dto/expenses-query.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { AllowApiKey } from '../common/decorators/allow-api-key.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@ApiTags('Expenses')
@ApiBearerAuth()
@Controller('expenses')
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  @AllowApiKey()
  @Roles(UserRole.ADMIN, UserRole.DRIVER)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary: 'Listar gastos (filtros status/from/to/merchant)',
    description:
      'JWT driver: solo los suyos. JWT admin: flota con filtros. ' +
      'API Key (n8n): requiere document + phone y solo devuelve gastos de ese conductor. ' +
      'Cada ítem incluye status (enum) y statusLabel (español).',
  })
  findAll(@Query() query: ExpensesQueryDto, @CurrentUser() user: AuthUser) {
    return this.expensesService.findAll(query, user);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.DRIVER)
  @ApiOperation({ summary: 'Detalle de gasto' })
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expensesService.findOne(id, user);
  }

  @Post()
  @AllowApiKey()
  @Roles(UserRole.ADMIN)
  @ApiSecurity('api-key')
  @ApiOperation({
    summary:
      'Crear gasto definitivo (tras confirmación). Soporta force para duplicados.',
    description:
      'Con API Key: además de driverId exige document + phone del conductor de la ' +
      'conversación; deben coincidir con el driverId. ' +
      'Conductor INACTIVE → 403 DRIVER_INACTIVE (solo puede ver info y gastos).',
  })
  create(@Body() dto: CreateExpenseDto, @CurrentUser() user: AuthUser) {
    return this.expensesService.create(dto, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Actualizar gasto (admin)' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateExpenseDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expensesService.update(id, dto, user);
  }

  @Post(':id/review')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Marcar gasto como revisado' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expensesService.review(id, user);
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Rechazar gasto' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.expensesService.reject(id, user);
  }
}
