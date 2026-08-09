/**
 * Cuerpo tipado que se lanza con HttpException y reenvía el filtro global.
 * `code` es el único contrato estable para ramas en n8n.
 */
export type ApiErrorBody = {
  /** Código máquina (estable). Ej: DRIVER_NOT_FOUND */
  code: string;
  /** Texto humano (puede cambiar sin romper el bot) */
  message: string;
  /** Detalles legibles / validación */
  errors?: string[];
  /** Subtipo opcional (ej. soft vs hard duplicate en el futuro) */
  reason?: string;
  existingExpense?: unknown;
  /** Flags útiles al bot */
  canCreateExpenses?: boolean;
  canViewProfile?: boolean;
  canViewExpenses?: boolean;
  [key: string]: unknown;
};

export function apiError(
  code: string,
  message: string,
  extra?: Omit<ApiErrorBody, 'code' | 'message'>,
): ApiErrorBody {
  return {
    code,
    message,
    ...extra,
  };
}
