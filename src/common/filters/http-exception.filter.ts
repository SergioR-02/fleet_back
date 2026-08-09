import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiErrorCode } from '../errors/api-error-codes';

/**
 * Formato fijo de error:
 * { statusCode, code, message, errors?, reason?, existingExpense?, ...flags }
 *
 * n8n debe ramificar por `code`, nunca por el texto de `message`.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let payload: Record<string, unknown> = {
      statusCode,
      code: ApiErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    };

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        payload = {
          statusCode,
          code: this.codeFromStatusAndMessage(statusCode, body),
          message: body,
        };
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        let message: unknown = obj.message ?? 'Error';
        let errors: string[] | undefined;

        // class-validator / Nest: message es array de strings
        if (Array.isArray(obj.message)) {
          errors = obj.message as string[];
          message = 'Validation failed';
        }
        if (Array.isArray(obj.errors)) {
          errors = obj.errors as string[];
        }
        if (typeof message !== 'string') {
          message = 'Error';
        }

        const code =
          (typeof obj.code === 'string' && obj.code) ||
          this.codeFromStatusAndMessage(statusCode, message as string);

        payload = {
          statusCode,
          code,
          message,
          ...(errors ? { errors } : {}),
          ...(typeof obj.reason === 'string' ? { reason: obj.reason } : {}),
          ...(obj.existingExpense !== undefined
            ? { existingExpense: obj.existingExpense }
            : {}),
          ...(obj.canCreateExpenses !== undefined
            ? { canCreateExpenses: obj.canCreateExpenses }
            : {}),
          ...(obj.canViewProfile !== undefined
            ? { canViewProfile: obj.canViewProfile }
            : {}),
          ...(obj.canViewExpenses !== undefined
            ? { canViewExpenses: obj.canViewExpenses }
            : {}),
        };
      }
    }

    response.status(statusCode).json(payload);
  }

  /** Fallback si alguna excepción vieja no trae `code`. */
  private codeFromStatusAndMessage(status: number, message: string): string {
    const m = message.toLowerCase();

    if (status === HttpStatus.UNAUTHORIZED) {
      return m.includes('credential')
        ? ApiErrorCode.INVALID_CREDENTIALS
        : ApiErrorCode.UNAUTHORIZED;
    }
    if (status === HttpStatus.FORBIDDEN) {
      if (m.includes('inactive')) return ApiErrorCode.DRIVER_INACTIVE;
      if (m.includes('profile')) return ApiErrorCode.DRIVER_PROFILE_MISSING;
      return ApiErrorCode.FORBIDDEN;
    }
    if (status === HttpStatus.NOT_FOUND) {
      if (m.includes('driver')) return ApiErrorCode.DRIVER_NOT_FOUND;
      if (m.includes('expense')) return ApiErrorCode.EXPENSE_NOT_FOUND;
      return ApiErrorCode.NOT_FOUND;
    }
    if (status === HttpStatus.CONFLICT) {
      if (m.includes('duplicate') || m.includes('possible')) {
        return ApiErrorCode.EXPENSE_DUPLICATE;
      }
      if (m.includes('document')) return ApiErrorCode.DRIVER_DOCUMENT_EXISTS;
      if (m.includes('phone')) return ApiErrorCode.DRIVER_PHONE_EXISTS;
      return ApiErrorCode.EXPENSE_DUPLICATE;
    }
    if (status === HttpStatus.BAD_REQUEST) {
      if (m.includes('validation')) return ApiErrorCode.VALIDATION_FAILED;
      if (m.includes('create expense')) return ApiErrorCode.EXPENSE_CREATE_FAILED;
      return ApiErrorCode.VALIDATION_FAILED;
    }

    return ApiErrorCode.INTERNAL_ERROR;
  }
}
