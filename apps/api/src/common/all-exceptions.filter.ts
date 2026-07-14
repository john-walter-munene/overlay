import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { httpErrorsTotal } from './metrics';

/**
 * Catch-all exception filter. Returns a consistent JSON error envelope and,
 * crucially, never leaks stack traces or internal error messages for
 * unexpected (non-HttpException) errors — those are logged server-side and
 * surfaced to clients as a generic 500.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly log = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'InternalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (body && typeof body === 'object') {
        const b = body as { message?: string | string[]; error?: string };
        message = b.message ?? exception.message;
        error = b.error ?? exception.name;
      }
    } else {
      // Unexpected error: log the detail, return an opaque message.
      this.log.error(
        `Unhandled error on ${req?.method} ${req?.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    res.status(status).json({
      statusCode: status,
      error,
      message,
      path: req?.url,
      timestamp: new Date().toISOString(),
    });

    // OB-093: count server errors (>=500) for the API error-rate SLO. Client
    // errors (4xx) are expected traffic and excluded so the SLI reflects faults.
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      httpErrorsTotal.inc({ status: String(status) });
    }
  }
}
