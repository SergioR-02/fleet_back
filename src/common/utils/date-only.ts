import { BadRequestException } from '@nestjs/common';
import { ApiErrorCode } from '../errors/api-error-codes';
import { apiError } from '../errors/api-error';

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Contrato API de fechas de negocio (gasto, filtros from/to):
 * - Solo día civil, sin hora ni zona.
 * - Formato canónico: YYYY-MM-DD
 *
 * Acepta de n8n/OCR variantes comunes y devuelve siempre "YYYY-MM-DD"
 * o lanza VALIDATION_FAILED.
 */
export function normalizeDateOnly(value: string | Date | null | undefined): string {
  if (value === null || value === undefined || value === '') {
    throw new BadRequestException(
      apiError(ApiErrorCode.VALIDATION_FAILED, 'Validation failed', {
        errors: ['date is required (YYYY-MM-DD)'],
      }),
    );
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      throw invalidDate();
    }
    // Componentes UTC del instant: para DATE de negocio preferimos
    // construir solo si la fuente ya era date-only; ver parse de string.
    return formatYmd(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    );
  }

  const raw = String(value).trim();

  // 1) Prefijo YYYY-MM-DD (ISO date, ISO datetime, "2026-08-08T00:00:00.000Z")
  const m = raw.match(DATE_ONLY);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    if (!isValidYmd(y, mo, d)) throw invalidDate();
    return formatYmd(y, mo, d);
  }

  // 2) DD/MM/YYYY o DD-MM-YYYY (frecuente en recibos CO)
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (dmy) {
    const d = Number(dmy[1]);
    const mo = Number(dmy[2]);
    const y = Number(dmy[3]);
    if (!isValidYmd(y, mo, d)) throw invalidDate();
    return formatYmd(y, mo, d);
  }

  throw invalidDate();
}

/** Date a medianoche UTC del día YYYY-MM-DD (seguro para columnas @db.Date). */
export function toDateOnlyUtc(value: string | Date): Date {
  const ymd = normalizeDateOnly(value);
  const [y, mo, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, d));
}

export function formatDateOnly(value: Date): string {
  return normalizeDateOnly(
    formatYmd(
      value.getUTCFullYear(),
      value.getUTCMonth() + 1,
      value.getUTCDate(),
    ),
  );
}

function formatYmd(y: number, mo: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function isValidYmd(y: number, mo: number, d: number): boolean {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === mo - 1 &&
    dt.getUTCDate() === d
  );
}

function invalidDate(): never {
  throw new BadRequestException(
    apiError(ApiErrorCode.VALIDATION_FAILED, 'Validation failed', {
      errors: [
        'date must be a calendar day (YYYY-MM-DD), without time component',
      ],
    }),
  );
}
