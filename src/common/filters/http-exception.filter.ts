import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let payload: Record<string, unknown> = {
      statusCode,
      message: 'Internal server error',
    };

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        payload = { statusCode, message: body };
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        let message = obj.message ?? 'Error';
        let errors: string[] | undefined;

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

        payload = {
          statusCode,
          message,
          ...(errors ? { errors } : {}),
          ...(obj.existingExpense
            ? { existingExpense: obj.existingExpense }
            : {}),
        };
      }
    }

    response.status(statusCode).json(payload);
  }
}
