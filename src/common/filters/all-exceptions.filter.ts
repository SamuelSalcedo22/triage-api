import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

/**
 * Filtro global de excepciones.
 * Hace que TODOS los errores de la API tengan el mismo formato:
 * { statusCode, error, message, path, timestamp }
 * Así el frontend siempre sabe dónde leer el mensaje de error.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let statusCode: number = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Error interno del servidor';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : ((res as { message?: string | string[] }).message ?? exception.message);
    } else if (exception instanceof QueryFailedError) {
      // 23505 = violación de restricción UNIQUE en PostgreSQL
      const code = (exception as QueryFailedError & { code?: string }).code;
      if (code === '23505') {
        statusCode = HttpStatus.CONFLICT;
        message = 'Ya existe un registro con esos datos únicos';
      } else {
        this.logger.error(exception.message, exception.stack);
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(statusCode).json({
      statusCode,
      error: HttpStatus[statusCode] ?? 'ERROR',
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
