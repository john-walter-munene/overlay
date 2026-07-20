/**
 * Structured JSON logging (OB-091).
 *
 * Replaces ad-hoc `console.log` and the default Nest console transport with a
 * single logger that emits one JSON object per line, enriched with the active
 * request/job correlation id (see `correlation.ts`). Structured logs are
 * machine-parseable so a log aggregator can index by `level`, `context`, and
 * `correlationId` and stitch a single request or worker cycle back together.
 *
 * This module is intentionally decorator-free and carries no runtime dependency
 * on `correlation.ts` (the correlation context is *injected* via `getContext`,
 * and the `import type` below is erased at runtime), so it — and its unit tests
 * — run under the `--experimental-strip-types` runner, matching the
 * module-boundary conventions of `metrics.ts` and `throttling.ts`. The
 * production wiring that binds the correlation store lives in
 * `logger.factory.ts`.
 */
import type { LoggerService } from '@nestjs/common';
import type { CorrelationContext } from './correlation';

/**
 * Canonical severities, ordered most-severe first. `info` is the structured
 * name for Nest's `log()` level. A configured threshold enables that level and
 * everything more severe than it.
 */
export const LOG_LEVELS = ['error', 'warn', 'info', 'debug', 'verbose'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** Numeric priority: lower is more severe, so `level <= threshold` = enabled. */
const PRIORITY: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
  verbose: 4,
};

/** Default threshold when `LOG_LEVEL` is unset or unrecognised. */
export const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/**
 * Parse a `LOG_LEVEL` env value into a canonical level. Case-insensitive;
 * accepts Nest's `log` as an alias for `info`. Falls back to
 * {@link DEFAULT_LOG_LEVEL} for absent/blank/unknown values.
 */
export function parseLogLevel(
  value: string | undefined,
  fallback: LogLevel = DEFAULT_LOG_LEVEL,
): LogLevel {
  const normalized = (value ?? '').trim().toLowerCase();
  if (normalized === 'log') return 'info';
  return (LOG_LEVELS as readonly string[]).includes(normalized)
    ? (normalized as LogLevel)
    : fallback;
}

/** True when `level` should be emitted given the configured `threshold`. */
export function isLevelEnabled(level: LogLevel, threshold: LogLevel): boolean {
  return PRIORITY[level] <= PRIORITY[threshold];
}

/** A single structured log record before serialisation. */
export interface LogEntry {
  level: LogLevel;
  message: unknown;
  /** Nest passes the logger's context (usually a class name) as a string. */
  context?: string;
  /** Error stack/trace, when logging an error. */
  stack?: string;
}

/** The serialisable shape written as one JSON line. */
export interface StructuredLog {
  time: string;
  level: LogLevel;
  message: string;
  context?: string;
  correlationId?: string;
  /** Alias of `correlationId` named for the unit of work (request/job id). */
  requestId?: string;
  jobId?: string;
  stack?: string;
}

/** Coerce arbitrary log arguments into a string message. */
function toMessage(message: unknown): string {
  if (typeof message === 'string') return message;
  if (message instanceof Error) return message.message;
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

/**
 * Build the structured record for an entry, folding in the given correlation
 * context. Pure (takes `now` and `correlation`) so it is deterministic under
 * test.
 */
export function formatLogEntry(
  entry: LogEntry,
  now: Date = new Date(),
  correlation?: CorrelationContext,
): StructuredLog {
  const record: StructuredLog = {
    time: now.toISOString(),
    level: entry.level,
    message: toMessage(entry.message),
  };
  if (entry.context) record.context = entry.context;
  if (correlation) {
    record.correlationId = correlation.correlationId;
    if (correlation.kind === 'request') {
      record.requestId = correlation.correlationId;
    } else {
      record.jobId = correlation.correlationId;
    }
  }
  if (entry.stack) record.stack = entry.stack;
  return record;
}

/** Serialise a structured record to a single JSON line. */
export function serializeLog(record: StructuredLog): string {
  return JSON.stringify(record);
}

/** Sink functions for stdout/stderr; injectable so tests can capture output. */
export interface LoggerSink {
  stdout: (line: string) => void;
  stderr: (line: string) => void;
}

const defaultSink: LoggerSink = {
  stdout: (line) => process.stdout.write(line + '\n'),
  stderr: (line) => process.stderr.write(line + '\n'),
};

export interface StructuredLoggerOptions {
  /** Minimum level to emit; defaults to {@link DEFAULT_LOG_LEVEL}. */
  level?: LogLevel;
  /** Clock, injectable for deterministic tests. */
  now?: () => Date;
  /** Output sink; injectable for tests. */
  sink?: LoggerSink;
  /**
   * Source of the active correlation context. Injected (rather than imported)
   * so this module stays free of a runtime dependency on `correlation.ts`; the
   * production factory binds it to the AsyncLocalStorage-backed store.
   */
  getContext?: () => CorrelationContext | undefined;
}

/**
 * Nest-compatible structured logger. Warnings and errors go to stderr; all
 * other levels to stdout. Each call is enriched with the active correlation id
 * and dropped entirely when below the configured level.
 */
export class StructuredLogger implements LoggerService {
  private readonly level: LogLevel;
  private readonly now: () => Date;
  private readonly sink: LoggerSink;
  private readonly getContext: () => CorrelationContext | undefined;

  constructor(options: StructuredLoggerOptions = {}) {
    this.level = options.level ?? DEFAULT_LOG_LEVEL;
    this.now = options.now ?? (() => new Date());
    this.sink = options.sink ?? defaultSink;
    this.getContext = options.getContext ?? (() => undefined);
  }

  private emit(entry: LogEntry): void {
    if (!isLevelEnabled(entry.level, this.level)) return;
    const record = formatLogEntry(entry, this.now(), this.getContext());
    const line = serializeLog(record);
    if (entry.level === 'error' || entry.level === 'warn') {
      this.sink.stderr(line);
    } else {
      this.sink.stdout(line);
    }
  }

  log(message: unknown, context?: string): void {
    this.emit({ level: 'info', message, context });
  }

  error(message: unknown, stack?: string, context?: string): void {
    this.emit({ level: 'error', message, stack, context });
  }

  warn(message: unknown, context?: string): void {
    this.emit({ level: 'warn', message, context });
  }

  debug(message: unknown, context?: string): void {
    this.emit({ level: 'debug', message, context });
  }

  verbose(message: unknown, context?: string): void {
    this.emit({ level: 'verbose', message, context });
  }
}
