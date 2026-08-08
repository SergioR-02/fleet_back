import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DriverStatus,
  ExpenseSource,
  ExpenseStatus,
  Prisma,
  UserRole,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateExpenseDto } from './dto/create-expense.dto';
import { UpdateExpenseDto } from './dto/update-expense.dto';
import { ExpensesQueryDto } from './dto/expenses-query.dto';
import type { AuthUser } from '../common/decorators/current-user.decorator';

@Injectable()
export class ExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
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
      expenseDate: e.expenseDate.toISOString().slice(0, 10),
      description: e.description,
      invoiceNumber: e.invoiceNumber,
      status: e.status,
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
      const d = new Date(dto.expenseDate);
      if (Number.isNaN(d.getTime())) errors.push('expense_date is invalid');
    }
    if (errors.length) {
      throw new BadRequestException({
        message: 'Cannot create expense',
        errors,
      });
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
      expenseDate: new Date(params.expenseDate),
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

    if (user.role === UserRole.DRIVER) {
      if (!user.driverId) throw new ForbiddenException('Driver profile missing');
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
      if (query.from) where.expenseDate.gte = new Date(query.from);
      if (query.to) where.expenseDate.lte = new Date(query.to);
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
    if (!expense) throw new NotFoundException('Expense not found');

    if (
      user.role === UserRole.DRIVER &&
      user.driverId &&
      expense.driverId !== user.driverId
    ) {
      throw new ForbiddenException('You cannot view this expense');
    }

    return this.mapExpense(expense);
  }

  async create(dto: CreateExpenseDto, user?: AuthUser) {
    this.validateBusinessRules(dto);

    const driver = await this.prisma.driver.findUnique({
      where: { id: dto.driverId },
    });
    if (!driver) {
      throw new BadRequestException({
        message: 'Cannot create expense',
        errors: ['driver does not exist'],
      });
    }
    if (driver.status !== DriverStatus.ACTIVE) {
      throw new BadRequestException({
        message: 'Cannot create expense',
        errors: ['driver is not active'],
      });
    }

    if (!dto.force) {
      const duplicate = await this.findPossibleDuplicate({
        driverId: dto.driverId,
        nit: dto.nit,
        amount: dto.amount,
        expenseDate: dto.expenseDate,
        invoiceNumber: dto.invoiceNumber,
      });

      if (duplicate) {
        throw new ConflictException({
          message: 'Possible duplicate expense',
          errors: [
            'A similar expense already exists. Retry with force=true if you want to create it anyway.',
          ],
          existingExpense: this.mapExpense(duplicate),
        });
      }
    }

    const expense = await this.prisma.expense.create({
      data: {
        driverId: dto.driverId,
        nit: dto.nit.trim(),
        merchantName: dto.merchantName.trim(),
        amount: new Prisma.Decimal(dto.amount),
        expenseDate: new Date(dto.expenseDate),
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
    if (!current) throw new NotFoundException('Expense not found');

    if (dto.amount !== undefined && dto.amount <= 0) {
      throw new BadRequestException({
        message: 'Cannot update expense',
        errors: ['amount must be greater than 0'],
      });
    }

    const expense = await this.prisma.expense.update({
      where: { id },
      data: {
        nit: dto.nit?.trim(),
        merchantName: dto.merchantName?.trim(),
        amount:
          dto.amount !== undefined ? new Prisma.Decimal(dto.amount) : undefined,
        expenseDate: dto.expenseDate ? new Date(dto.expenseDate) : undefined,
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
    if (!current) throw new NotFoundException('Expense not found');

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
