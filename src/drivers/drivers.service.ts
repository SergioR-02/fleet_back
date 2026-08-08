import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DriverStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { DriversQueryDto } from './dto/drivers-query.dto';
import { UpdateDriverStatusDto } from './dto/update-driver-status.dto';
import type { AuthUser } from '../common/decorators/current-user.decorator';

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
    if (query.search) {
      const s = query.search.trim();
      where.OR = [
        { document: { contains: s, mode: 'insensitive' } },
        { name: { contains: s, mode: 'insensitive' } },
        { plate: { contains: s, mode: 'insensitive' } },
      ];
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
    if (!driver) throw new NotFoundException('Driver not found');
    return this.mapDriver(driver);
  }

  async findByDocument(document: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { document: document.trim() },
    });
    if (!driver) throw new NotFoundException('Driver not found');
    return this.mapDriver(driver);
  }

  /**
   * Verificación para n8n / WhatsApp:
   * exige cédula + celular coincidentes (y preferible ACTIVE).
   */
  async verifyByDocumentAndPhone(document: string, phone: string) {
    const doc = document.trim();
    const phoneIncoming = phone.trim();

    if (!doc || !phoneIncoming) {
      throw new NotFoundException('Driver not found');
    }

    // 1) Buscar por cédula exacta o solo dígitos
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
      throw new NotFoundException({
        message: 'Driver not found',
        errors: [
          'No hay un conductor activo con esa cédula y celular. Verifique ambos datos.',
        ],
      });
    }

    if (driver.status !== DriverStatus.ACTIVE) {
      throw new NotFoundException({
        message: 'Driver not active',
        errors: ['El conductor existe pero está inactivo.'],
      });
    }

    return {
      verified: true,
      driver: this.mapDriver(driver),
    };
  }

  async findExpensesByDocument(document: string, page = 1, limit = 10) {
    const driver = await this.prisma.driver.findUnique({
      where: { document: document.trim() },
    });
    if (!driver) throw new NotFoundException('Driver not found');

    const where = { driverId: driver.id };
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
      driver: this.mapDriver(driver),
      data: rows.map((e) => ({
        id: e.id,
        driverId: e.driverId,
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
      throw new ConflictException('A driver with this document already exists');
    }

    const existingPhone = await this.prisma.driver.findUnique({
      where: { phone: dto.phone.trim() },
    });
    if (existingPhone) {
      throw new ConflictException('A driver with this phone already exists');
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
        throw new ConflictException('A driver with this phone already exists');
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
