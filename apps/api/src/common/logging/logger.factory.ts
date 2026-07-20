/**
 * Logger factory (OB-091) — production wiring.
 *
 * Binds the AsyncLocalStorage-backed correlation store (`correlation.ts`) to the
 * transport-only {@link StructuredLogger} (`logger.ts`). Kept separate so the
 * logger core and its unit tests stay free of a runtime dependency on the
 * correlation module (and thus runnable under `--experimental-strip-types`).
 * Both the API (`main.ts`) and the worker (`worker.ts`) construct their logger
 * here so they share one format and one `LOG_LEVEL` knob.
 */
import { getCorrelationContext } from './correlation';
import {
  StructuredLogger,
  parseLogLevel,
  type StructuredLoggerOptions,
} from './logger';

export function createLogger(
  env: Record<string, string | undefined> = process.env,
  overrides: Omit<StructuredLoggerOptions, 'level' | 'getContext'> = {},
): StructuredLogger {
  return new StructuredLogger({
    level: parseLogLevel(env.LOG_LEVEL),
    getContext: getCorrelationContext,
    ...overrides,
  });
}
