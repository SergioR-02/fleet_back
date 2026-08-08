import { PrismaClient, UserRole, DriverStatus, ExpenseStatus, ExpenseSource } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@fleetexpense.local';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'Admin123!';
  const passwordHash = await bcrypt.hash(adminPassword, 10);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash,
      role: UserRole.ADMIN,
    },
  });

  const driversData = [
    {
      document: '1020304050',
      name: 'Carlos Gómez',
      phone: '3001234567',
      email: 'carlos.gomez@fleetexpense.local',
      plate: 'ABC123',
      status: DriverStatus.ACTIVE,
    },
    {
      document: '1099887766',
      name: 'María López',
      phone: '3109876543',
      email: 'maria.lopez@fleetexpense.local',
      plate: 'XYZ789',
      status: DriverStatus.ACTIVE,
    },
    {
      document: '80123456',
      name: 'Andrés Ruiz',
      phone: '3205554433',
      email: null as string | null,
      plate: 'JKL456',
      status: DriverStatus.INACTIVE,
    },
    {
      document: '52998877',
      name: 'Laura Méndez',
      phone: '3157778899',
      email: 'laura.mendez@email.com',
      plate: null as string | null,
      status: DriverStatus.ACTIVE,
    },
  ];

  const drivers = [];
  for (const d of driversData) {
    const driver = await prisma.driver.upsert({
      where: { document: d.document },
      update: {
        name: d.name,
        phone: d.phone,
        email: d.email,
        plate: d.plate,
        status: d.status,
      },
      create: d,
    });
    drivers.push(driver);
  }

  const carlos = drivers.find((d) => d.document === '1020304050')!;
  const maria = drivers.find((d) => d.document === '1099887766')!;

  await prisma.user.upsert({
    where: { email: 'carlos.gomez@fleetexpense.local' },
    update: { driverId: carlos.id },
    create: {
      email: 'carlos.gomez@fleetexpense.local',
      passwordHash,
      role: UserRole.DRIVER,
      driverId: carlos.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'maria.lopez@fleetexpense.local' },
    update: { driverId: maria.id },
    create: {
      email: 'maria.lopez@fleetexpense.local',
      passwordHash,
      role: UserRole.DRIVER,
      driverId: maria.id,
    },
  });

  const expenseCount = await prisma.expense.count();
  if (expenseCount === 0) {
    const created = await prisma.expense.createMany({
      data: [
        {
          driverId: carlos.id,
          nit: '860002180-1',
          merchantName: 'TERPEL',
          amount: 250000,
          expenseDate: new Date('2026-08-05'),
          description: 'Combustible diesel',
          invoiceNumber: 'FV-100234',
          status: ExpenseStatus.PENDING_REVIEW,
          source: ExpenseSource.WHATSAPP,
        },
        {
          driverId: carlos.id,
          nit: '900123456-1',
          merchantName: 'PRIMAX',
          amount: 185000,
          expenseDate: new Date('2026-08-02'),
          description: 'Combustible',
          invoiceNumber: null,
          status: ExpenseStatus.REVIEWED,
          source: ExpenseSource.WHATSAPP,
        },
        {
          driverId: maria.id,
          nit: '890900608-9',
          merchantName: 'ÉXITO',
          amount: 47500,
          expenseDate: new Date('2026-08-04'),
          description: 'Peaje y víveres de ruta',
          invoiceNumber: 'POS-9981',
          status: ExpenseStatus.PENDING_REVIEW,
          source: ExpenseSource.WHATSAPP,
        },
        {
          driverId: maria.id,
          nit: '830113831-1',
          merchantName: 'TEXACO',
          amount: 320000,
          expenseDate: new Date('2026-07-28'),
          description: null,
          invoiceNumber: 'FV-556677',
          status: ExpenseStatus.REJECTED,
          source: ExpenseSource.WHATSAPP,
        },
      ],
    });

    await prisma.auditLog.create({
      data: {
        userId: null,
        action: 'EXPENSE_CREATED',
        entity: 'expense',
        entityId: 'seed',
        metadata: {
          source: 'SEED',
          actor: 'SYSTEM',
          count: created.count,
        },
      },
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      action: 'SYSTEM_SEEDED',
      entity: 'system',
      entityId: admin.id,
      metadata: {
        adminEmail,
        drivers: drivers.length,
      },
    },
  });

  console.log('Seed OK');
  console.log(`  Admin: ${adminEmail} / ${adminPassword}`);
  console.log('  Driver: carlos.gomez@fleetexpense.local / same password');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
