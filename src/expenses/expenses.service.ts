import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ExpenseSource,
  ExpenseStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { DriversService } from '../drivers/drivers.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesQueryDto } from './dto/expenses-query.dto';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { expenseStatusLabel } from '../common/utils/expense-status-label';
import {
  formatDateOnly,
  normalizeDateOnly,
  toDateOnlyUtc,
} from '../common/utils/date-only';
import { ApiErrorCode } from '../common/errors/api-error-codes';
import { apiError } from '../common/errors/api-error';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly drivers: DriversService,
  ) {}

  private mapExpense(
    e: {
      id: string;
      driverId: string;
      nit: string;
      merchantName: string;
      amount: Prisma.Decimal;
      expenseDate: Date;
      description: string | null;
      invoiceNumber: string | null;
      status: ExpenseStatus;
      source: ExpenseSource;
      createdAt: Date;
      updatedAt: Date;
      driver?: { id: string; name: string; document: string } | null;
    },
  ) {
    return {
      id: e.id,
      driverId: e.driverId,
      driver: e.driver
        ? {
            id: e.driver.id,
            name: e.driver.name,
            document: e.driver.document,
          }
        : undefined,
      nit: e.nit,
      merchantName: e.merchantName,
      amount: Number(e.amount),
      expenseDate: formatDateOnly(e.expenseDate),
      description: e.description,
      invoiceNumber: e.invoiceNumber,
      status: e.status,
      statusLabel: expenseStatusLabel(e.status),
      source: e.source,
      createdAt: e.createdAt.toISOString(),
      updatedAt: e.updatedAt.toISOString(),
    };
  }

  private validateBusinessRules(dto: {
    nit: string;
    merchantName: string;
    amount: number;
    expenseDate: string;
  }) {
    const errors: string[] = [];
    if (!dto.nit?.trim()) errors.push('nit is required');
    if (!/^[0-9.\-]+$/.test(dto.nit.trim())) {
      errors.push('nit format is invalid');
    }
    if (!dto.merchantName?.trim()) errors.push('merchant_name is required');
    if (dto.amount === undefined || dto.amount === null) {
      errors.push('amount is required');
    } else if (Number(dto.amount) <= 0) {
      errors.push('amount must be greater than 0');
    }
    if (!dto.expenseDate) errors.push('expense_date is required');
    else {
      try {
        normalizeDateOnly(dto.expenseDate);
      } catch {
        errors.push('expense_date must be YYYY-MM-DD (no time)');
      }
    }
    if (errors.length) {
      throw new BadRequestException(
        apiError(ApiErrorCode.EXPENSE_CREATE_FAILED, 'Cannot create expense', {
          errors,
        }),
      );
    }
  }

  async findPossibleDuplicate(params: {
    driverId: string;
    nit: string;
    amount: number;
    expenseDate: string;
    invoiceNumber?: string | null;
  }) {
    const where: Prisma.ExpenseWhereInput = {
      driverId: params.driverId,
      nit: params.nit.trim(),
      amount: new Prisma.Decimal(params.amount),
      expenseDate: toDateOnlyUtc(params.expenseDate),
    };

    if (params.invoiceNumber) {
      where.invoiceNumber = params.invoiceNumber.trim();
    }

    return this.prisma.expense.findFirst({
      where,
      include: {
        driver: { select: { id: true, name: true, document: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(query: ExpensesQueryDto, user: AuthUser) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.ExpenseWhereInput = {};

    if (user.isService) {
      if (!query.document?.trim() || !query.phone?.trim()) {
        throw new BadRequestException(
          apiError(
            ApiErrorCode.DRIVER_DOCUMENT_PHONE_REQUIRED,
            'Cannot list expenses',
            {
              errors: [
                'Con API Key se requieren document y phone del conductor de la conversación.',
              ],
            },
          ),
        );
      }
      // Inactivos también consultan gastos; create es lo que se bloquea
      const driver = await this.drivers.requireByDocumentAndPhone(
        query.document,
        query.phone,
      );
      where.driverId = driver.id;
      if (query.driverId && query.driverId !== driver.id) {
        throw new ForbiddenException(
          apiError(
            ApiErrorCode.DRIVER_IDENTITY_MISMATCH,
            'driverId no coincide con la identidad document+phone',
          ),
        );
      }
    } else if (user.role === UserRole.DRIVER) {
      if (!user.driverId) {
        throw new ForbiddenException(
          apiError(
            ApiErrorCode.DRIVER_PROFILE_MISSING,
            'Driver profile missing',
          ),
        );
      }
      where.driverId = user.driverId;
    } else if (query.driverId) {
      where.driverId = query.driverId;
    }

    if (query.status) where.status = query.status;
    if (query.merchant) {
      where.merchantName = {
        contains: query.merchant.trim(),
        mode: 'insensitive',
      };
    }
    if (query.from || query.to) {
      where.expenseDate = {};
      if (query.from) where.expenseDate.gte = toDateOnlyUtc(query.from);
      if (query.to) where.expenseDate.lte = toDateOnlyUtc(query.to);
    }
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { merchantName: { contains: s, mode: 'insensitive' } },
        { nit: { contains: s, mode: 'insensitive' } },
        { driver: { name: { contains: s, mode: 'insensitive' } } },
        { driver: { document: { contains: s, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        include: {
          driver: { select: { id: true, name: true, document: true } },
        },
        orderBy: { expenseDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((e) => this.mapExpense(e)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async findOne(id: string, user: AuthUser) {
    const expense = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, name: true, document: true } },
      },
    });
    if (!expense) {
      throw new NotFoundException(
        apiError(ApiErrorCode.EXPENSE_NOT_FOUND, 'Expense not found'),
      );
    }

    if (
      user.role === UserRole.DRIVER &&
      user.driverId &&
      expense.driverId !== user.driverId
    ) {
      throw new ForbiddenException(
        apiError(ApiErrorCode.EXPENSE_FORBIDDEN, 'You cannot view this expense'),
      );
    }

    return this.mapExpense(expense);
  }

  async create(dto: CreateExpenseDto, user?: AuthUser) {
    this.validateBusinessRules(dto);

    let driverId = dto.driverId;

    if (user?.isService) {
      if (!dto.document?.trim() || !dto.phone?.trim()) {
        throw new BadRequestException(
          apiError(
            ApiErrorCode.DRIVER_DOCUMENT_PHONE_REQUIRED,
            'Cannot create expense',
            {
              errors: [
                'Con API Key se requieren document y phone del conductor de la conversación.',
              ],
            },
          ),
        );
      }
      const identified = await this.drivers.requireByDocumentAndPhone(
        dto.document,
        dto.phone,
      );
      if (identified.id !== dto.driverId) {
        throw new ForbiddenException(
          apiError(
            ApiErrorCode.DRIVER_IDENTITY_MISMATCH,
            'Cannot create expense',
            {
              errors: [
                'driverId no corresponde al conductor verificado con cédula y celular.',
              ],
            },
          ),
        );
      }
      this.drivers.throwIfInactiveForWrite(identified);
      driverId = identified.id;
    }

    const driver = await this.prisma.driver.findUnique({
      where: { id: driverId },
    });
    if (!driver) {
      throw new BadRequestException(
        apiError(ApiErrorCode.EXPENSE_CREATE_FAILED, 'Cannot create expense', {
          errors: ['driver does not exist'],
        }),
      );
    }
    // Panel admin o API key: no crear gastos a nombre de conductor inactivo
    this.drivers.throwIfInactiveForWrite(driver);

    if (!dto.force) {
      const expenseDate = normalizeDateOnly(dto.expenseDate);
      const duplicate = await this.findPossibleDuplicate({
        driverId,
        nit: dto.nit,
        amount: dto.amount,
        expenseDate,
        invoiceNumber: dto.invoiceNumber,
      });

      if (duplicate) {
        throw new ConflictException(
          apiError(
            ApiErrorCode.EXPENSE_DUPLICATE,
            'Possible duplicate expense',
            {
              reason: 'SUSPECTED_DUPLICATE',
              errors: [
                'A similar expense already exists. Retry with force=true if you want to create it anyway.',
              ],
              existingExpense: this.mapExpense(duplicate),
            },
          ),
        );
      }
    }

    const expenseDate = normalizeDateOnly(dto.expenseDate);

    const expense = await this.prisma.expense.create({
      data: {
        driverId,
        nit: dto.nit.trim(),
        merchantName: dto.merchantName.trim(),
        amount: new Prisma.Decimal(dto.amount),
        expenseDate: toDateOnlyUtc(expenseDate),
        description: dto.description?.trim() || null,
        invoiceNumber: dto.invoiceNumber?.trim() || null,
        status: ExpenseStatus.PENDING_REVIEW,
        source: dto.source,
      },
      include: {
        driver: { select: { id: true, name: true, document: true } },
      },
    });

    await this.audit.log({
      userId: user?.isService ? null : user?.id,
      action: 'EXPENSE_CREATED',
      entity: 'expense',
      entityId: expense.id,
      metadata: this.audit.actorMetadata(user, {
        source: expense.source,
        driver_id: driver.id,
        driver_document: driver.document,
        driver_name: driver.name,
        force: Boolean(dto.force),
      }),
    });

    return this.mapExpense(expense);
  }

  async update(id: string, dto: UpdateExpenseDto, user: AuthUser) {
    const current = await this.prisma.expense.findUnique({ where: { id } });
    if (!current) {
      throw new NotFoundException(
        apiError(ApiErrorCode.EXPENSE_NOT_FOUND, 'Expense not found'),
      );
    }

    if (dto.amount !== undefined && dto.amount <= 0) {
      throw new BadRequestException(
        apiError(ApiErrorCode.VALIDATION_FAILED, 'Cannot update expense', {
          errors: ['amount must be greater than 0'],
        }),
      );
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        nit: dto.nit?.trim(),
        merchantName: dto.merchantName?.trim(),
        amount:
          dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
        expenseDate: dto.expenseDate
          ? toDateOnlyUtc(normalizeDateOnly(dto.expenseDate))
          : undefined,
        description:
          dto.description === undefined
            ? undefined
            : dto.description?.trim() || null,
        invoiceNumber:
          dto.invoiceNumber === undefined
            ? undefined
            : dto.invoiceNumber?.trim() || null,
      },
      include: {
        driver: { select: { id: true, name: true, document: true } },
      },
    });

    await this.audit.log({
      userId: user.id,
      action: 'EXPENSE_UPDATED',
      entity: 'expense',
      entityId: id,
      metadata: this.audit.actorMetadata(user),
    });

    return this.mapExpense(expense);
  }

  async review(id: string, user: AuthUser) {
    return this.changeStatus(id, ExpenseStatus.REVIEWED, 'EXPENSE_REVIEWED', user);
  }

  async reject(id: string, user: AuthUser) {
    return this.changeStatus(id, ExpenseStatus.REJECTED, 'EXPENSE_REJECTED', user);
  }

  private async changeStatus(
    id: string,
    status: ExpenseStatus,
    action: string,
    user: AuthUser,
  ) {
    const current = await this.prisma.expense.findUnique({
      where: { id },
      include: {
        driver: { select: { id: true, name: true, document: true } },
      },
    });
    if (!current) {
      throw new NotFoundException(
        apiError(ApiErrorCode.EXPENSE_NOT_FOUND, 'Expense not found'),
      );
    }

    if (current.status === status) {
      return this.mapExpense(current);
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: { status },
      include: {
        driver: { select: { id: true, name: true, document: true } },
      },
    });

    await this.audit.log({
      userId: user.id,
      action,
      entity: 'expense',
      entityId: id,
      metadata: this.audit.actorMetadata(user, {
        previousStatus: current.status,
      }),
    });

    return this.mapExpense(expense);
  }
}
