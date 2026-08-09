import { ExpenseStatus } from '@prisma/client';

/** Etiquetas en español para respuestas al bot / panel. */
export const EXPENSE_STATUS_LABELS: Record<ExpenseStatus, string> = {
  [ExpenseStatus.PENDING_REVIEW]: 'Pendiente de revisión',
  [ExpenseStatus.REVIEWED]: 'Revisado',
  [ExpenseStatus.REJECTED]: 'Rechazado',
};

export function expenseStatusLabel(status: ExpenseStatus): string {
  return EXPENSE_STATUS_LABELS[status] ?? status;
}
