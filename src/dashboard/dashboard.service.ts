import { Injectable } from '@nestjs/common';
import { ExpenseStatus, DriverStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getSummary() {
    const now = new Date();
    const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const startOfNextMonth = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1),
    );

    const [
      totalDrivers,
      activeDrivers,
      totalExpenses,
      pendingReview,
      reviewed,
      rejected,
      monthExpenses,
      monthAmountAgg,
      recent,
    ] = await Promise.all([
      this.prisma.driver.count(),
      this.prisma.driver.count({ where: { status: DriverStatus.ACTIVE } }),
      this.prisma.expense.count(),
      this.prisma.expense.count({ where: { status: ExpenseStatus.PENDING_REVIEW } }),
      this.prisma.expense.count({ where: { status: ExpenseStatus.REVIEWED } }),
      this.prisma.expense.count({ where: { status: ExpenseStatus.REJECTED } }),
      this.prisma.expense.count({
        where: {
          expenseDate: { gte: startOfMonth, lt: startOfNextMonth },
        },
      }),
      this.prisma.expense.aggregate({
        where: {
          expenseDate: { gte: startOfMonth, lt: startOfNextMonth },
        },
        _sum: { amount: true },
      }),
      this.prisma.expense.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          driver: { select: { id: true, name: true, document: true } },
        },
      }),
    ]);

    return {
      totalDrivers,
      activeDrivers,
      totalExpenses,
      monthExpenses,
      monthExpensesAmount: Number(monthAmountAgg._sum.amount ?? 0),
      pendingReview,
      reviewed,
      rejected,
      recentExpenses: recent.map((e) => ({
        id: e.id,
        driverId: e.driverId,
        driver: e.driver
          ? { id: e.driver.id, name: e.driver.name, document: e.driver.document }
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
      })),
    };
  }
}
