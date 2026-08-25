import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Driver, DriverStatus, ExpenseStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversQueryDto } from './dto/drivers-query.dto';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import type { DriverExpensesQueryDto } from './dto/driver-expenses-query.dto';
import type { AuthUser } from '../common/decorators/current-user.decorator';
import { expenseStatusLabel } from '../common/utils/expense-status-label';
import {
  formatDateOnly,
  toDateOnlyUtc,
} from '../common/utils/date-only';
import { likePattern } from '../common/utils/accent';
import { ApiErrorCode } from '../common/errors/api-error-codes';
import { apiError } from '../common/errors/api-error';

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private mapDriver(d: {
    id: string;
    document: string;
    name: string;
    phone: string;
    email: string | null;
    plate: string | null;
    status: DriverStatus;
    createdAt: Date;
    updatedAt: Date;
  }) {
    return {
      id: d.id,
      document: d.document,
      name: d.name,
      phone: d.phone,
      email: d.email,
      plate: d.plate,
      status: d.status,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
    };
  }

  async findAll(query: DriversQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.DriverWhereInput = {};

    if (query.status) where.status = query.status;
    if (query.search?.trim()) {
      const pattern = likePattern(query.search);
      const rows = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT d.id
        FROM fleet.drivers d
        WHERE translate(
          lower(d.document),
          'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
          'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'
        ) LIKE ${pattern}
           OR translate(
          lower(d.name),
          'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
          'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'
        ) LIKE ${pattern}
           OR translate(
          lower(COALESCE(d.plate, '')),
          'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
          'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'
        ) LIKE ${pattern}
      `;
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) {
        return {
          data: [],
          meta: {
            page,
            limit,
            total: 0,
            totalPages: 1,
          },
        };
      }
      where.id = { in: ids };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.driver.count({ where }),
      this.prisma.driver.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      data: rows.map((d) => this.mapDriver(d)),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  /** Solo dígitos, para comparar cédulas/celulares con o sin formato. */
  private digitsOnly(value: string): string {
    return value.replace(/\D/g, '');
  }

  /**
   * Coincide teléfono exacto o con indicativo de país
   * (ej. WhatsApp 573001234567 vs BD 3001234567).
   */
  private phonesMatch(stored: string, incoming: string): boolean {
    const a = this.digitsOnly(stored);
    const b = this.digitsOnly(incoming);
    if (!a || !b) return false;
    if (a === b) return true;
    return a.endsWith(b) || b.endsWith(a);
  }

  async findOne(id: string) {
    const driver = await this.prisma.driver.findUnique({ where: { id } });
    if (!driver) {
      throw new NotFoundException(
        apiError(ApiErrorCode.DRIVER_NOT_FOUND, 'Driver not found'),
      );
    }
    return this.mapDriver(driver);
  }

  async findByDocument(document: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { document: document.trim() },
    });
    if (!driver) {
      throw new NotFoundException(
        apiError(ApiErrorCode.DRIVER_NOT_FOUND, 'Driver not found'),
      );
    }
    return this.mapDriver(driver);
  }

  /**
   * Mensaje único ante cédula inexistente o celular incorrecto.
   * (Inactivo no entra aquí: se identifica y se limita a consulta.)
   */
  private driverIdentityNotFound(): never {
    throw new NotFoundException(
      apiError(
        ApiErrorCode.DRIVER_NOT_FOUND,
        'Driver not found',
        {
          errors: [
            'No se encontró un conductor con esos datos. Verifique cédula y celular.',
          ],
        },
      ),
    );
  }

  /** 403: puede consultar, no puede registrar gastos. */
  throwIfInactiveForWrite(driver: Driver): void {
    if (driver.status === DriverStatus.ACTIVE) return;
    throw new ForbiddenException(
      apiError(
        ApiErrorCode.DRIVER_INACTIVE,
        'Driver inactive',
        {
          errors: [
            'Su cuenta de conductor está inactiva. Solo puede consultar su información y sus gastos; no puede registrar nuevos gastos.',
          ],
          canCreateExpenses: false,
          canViewProfile: true,
          canViewExpenses: true,
        },
      ),
    );
  }

  /**
   * Resolver por cédula + celular (ACTIVE o INACTIVE).
   * Fallos de identidad → 404 unificado (no oráculo).
   */
  async requireByDocumentAndPhone(document: string, phone: string) {
    const doc = document.trim();
    const phoneIncoming = phone.trim();
    if (!doc || !phoneIncoming) this.driverIdentityNotFound();

    let driver = await this.prisma.driver.findUnique({
      where: { document: doc },
    });

    if (!driver) {
      const docDigits = this.digitsOnly(doc);
      if (docDigits) {
        const candidates = await this.prisma.driver.findMany({
          where: {
            OR: [
              { document: docDigits },
              { document: { contains: docDigits } },
            ],
          },
          take: 5,
        });
        driver =
          candidates.find(
            (d) => this.digitsOnly(d.document) === docDigits,
          ) ?? null;
      }
    }

    if (!driver || !this.phonesMatch(driver.phone, phoneIncoming)) {
      this.driverIdentityNotFound();
    }

    return driver;
  }

  /**
   * Igual que requireByDocumentAndPhone, pero exige ACTIVE (crear gastos / escritura).
   */
  async requireActiveByDocumentAndPhone(document: string, phone: string) {
    const driver = await this.requireByDocumentAndPhone(document, phone);
    this.throwIfInactiveForWrite(driver);
    return driver;
  }

  /**
   * Verificación para n8n / WhatsApp: cédula + celular.
   * Si está inactivo: verified OK pero canCreateExpenses=false (solo consulta).
   */
  async verifyByDocumentAndPhone(document: string, phone: string) {
    const driver = await this.requireByDocumentAndPhone(document, phone);
    const active = driver.status === DriverStatus.ACTIVE;
    return {
      verified: true,
      canCreateExpenses: active,
      canViewProfile: true,
      canViewExpenses: true,
      message: active
        ? undefined
        : 'Su cuenta de conductor está inactiva. Solo puede consultar su información y sus gastos; no puede registrar nuevos gastos.',
      driver: this.mapDriver(driver),
    };
  }

  /**
   * Gastos del conductor (ACTIVE o INACTIVE pueden consultar).
   */
  async findExpensesForIdentity(
    document: string,
    query: DriverExpensesQueryDto,
  ) {
    const driver = await this.requireByDocumentAndPhone(
      document,
      query.phone,
    );

    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where: Prisma.ExpenseWhereInput = { driverId: driver.id };

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

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.expense.count({ where }),
      this.prisma.expense.findMany({
        where,
        orderBy: { expenseDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return {
      driver: {
        id: driver.id,
        document: driver.document,
        name: driver.name,
      },
      data: rows.map((e) => ({
        id: e.id,
        driverId: e.driverId,
        nit: e.nit,
        merchantName: e.merchantName,
        amount: Number(e.amount),
        expenseDate: formatDateOnly(e.expenseDate),
        description: e.description,
        invoiceNumber: e.invoiceNumber,
        status: e.status as ExpenseStatus,
        statusLabel: expenseStatusLabel(e.status),
        source: e.source,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString(),
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async create(dto: CreateDriverDto, user?: AuthUser) {
    const existingDoc = await this.prisma.driver.findUnique({
      where: { document: dto.document.trim() },
    });
    if (existingDoc) {
      throw new ConflictException(
        apiError(
          ApiErrorCode.DRIVER_DOCUMENT_EXISTS,
          'A driver with this document already exists',
        ),
      );
    }

    const existingPhone = await this.prisma.driver.findUnique({
      where: { phone: dto.phone.trim() },
    });
    if (existingPhone) {
      throw new ConflictException(
        apiError(
          ApiErrorCode.DRIVER_PHONE_EXISTS,
          'A driver with this phone already exists',
        ),
      );
    }

    const driver = await this.prisma.driver.create({
      data: {
        document: dto.document.trim(),
        name: dto.name.trim(),
        phone: dto.phone.trim(),
        email: dto.email?.trim() || null,
        plate: dto.plate?.trim() || null,
        status: dto.status ?? DriverStatus.ACTIVE,
      },
    });

    await this.audit.log({
      userId: user?.id,
      action: 'DRIVER_CREATED',
      entity: 'driver',
      entityId: driver.id,
      metadata: this.audit.actorMetadata(user, { document: driver.document }),
    });

    return this.mapDriver(driver);
  }

  async update(id: string, dto: UpdateDriverDto, user?: AuthUser) {
    await this.findOne(id);

    if (dto.phone) {
      const phoneOwner = await this.prisma.driver.findFirst({
        where: { phone: dto.phone.trim(), NOT: { id } },
      });
      if (phoneOwner) {
        throw new ConflictException(
          apiError(
            ApiErrorCode.DRIVER_PHONE_EXISTS,
            'A driver with this phone already exists',
          ),
        );
      }
    }

    const driver = await this.prisma.driver.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        phone: dto.phone?.trim(),
        email: dto.email === undefined ? undefined : dto.email?.trim() || null,
        plate: dto.plate === undefined ? undefined : dto.plate?.trim() || null,
        status: dto.status,
      },
    });

    await this.audit.log({
      userId: user?.id,
      action: 'DRIVER_UPDATED',
      entity: 'driver',
      entityId: driver.id,
      metadata: this.audit.actorMetadata(user, { document: driver.document }),
    });

    return this.mapDriver(driver);
  }

  async updateStatus(id: string, dto: UpdateDriverStatusDto, user?: AuthUser) {
    await this.findOne(id);

    const driver = await this.prisma.driver.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.audit.log({
      userId: user?.id,
      action:
        dto.status === DriverStatus.ACTIVE
          ? 'DRIVER_ACTIVATED'
          : 'DRIVER_DEACTIVATED',
      entity: 'driver',
      entityId: driver.id,
      metadata: this.audit.actorMetadata(user, {
        document: driver.document,
        status: dto.status,
      }),
    });

    return this.mapDriver(driver);
  }
}
