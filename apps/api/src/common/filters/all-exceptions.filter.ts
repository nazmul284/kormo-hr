import {
  ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

/** Turns every failure into a consistent, non-leaky JSON error body. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();
    const requestId = request?.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error: string | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const record = body as Record<string, unknown>;
        message = (record.message as string | string[]) ?? exception.message;
        error = record.error as string | undefined;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Map the Prisma errors that are genuinely the caller's fault.
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const fields = (exception.meta?.target as string[] | undefined)?.join(', ');
          message = fields
            ? `A record with the same ${fields} already exists.`
            : 'That record already exists.';
          error = 'Conflict';
          break;
        }
        case 'P2025':
          status = HttpStatus.NOT_FOUND;
          message = 'The requested record does not exist.';
          error = 'Not Found';
          break;
        case 'P2003':
          status = HttpStatus.BAD_REQUEST;
          message = 'That change references a record that does not exist.';
          error = 'Bad Request';
          break;
        default:
          this.logger.error(`prisma ${exception.code}: ${exception.message}`, exception.stack);
      }
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'The request payload did not match the expected shape.';
      error = 'Bad Request';
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      // Log the real cause, return a generic message: internal details are
      // never useful to a client and are often sensitive.
      this.logger.error(
        `${request?.method} ${request?.url} [${requestId}] → ${status}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
      message = 'Internal server error';
    }

    response.status(status).json({
      statusCode: status,
      message,
      ...(error ? { error } : {}),
      requestId,
      timestamp: new Date().toISOString(),
      path: request?.url,
    });
  }
}
