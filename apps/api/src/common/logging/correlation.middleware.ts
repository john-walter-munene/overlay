/**
 * Correlation middleware (OB-091).
 *
 * Runs first in the request pipeline: it accepts a caller-supplied
 * `x-request-id` (or mints one), echoes it back on the response so clients and
 * proxies can stitch traces together, and executes the remainder of the request
 * inside an `AsyncLocalStorage` scope so every log line for the request carries
 * the same id.
 */
import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import {
  CORRELATION_HEADER,
  resolveCorrelationId,
  runWithCorrelation,
} from './correlation';

@Injectable()
export class CorrelationMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const correlationId = resolveCorrelationId(req.headers[CORRELATION_HEADER]);
    res.setHeader(CORRELATION_HEADER, correlationId);
    runWithCorrelation({ correlationId, kind: 'request' }, () => next());
  }
}
