import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatLogEntry,
  isLevelEnabled,
  parseLogLevel,
  serializeLog,
  StructuredLogger,
  type LoggerSink,
} from './logger.ts';
import {
  getCorrelationContext,
  runWithCorrelation,
  type CorrelationContext,
} from './correlation.ts';

/** Capture stdout/stderr lines emitted by a StructuredLogger. */
function captureSink(): {
  sink: LoggerSink;
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  return {
    stdout,
    stderr,
    sink: {
      stdout: (line) => stdout.push(line),
      stderr: (line) => stderr.push(line),
    },
  };
}

const FIXED = new Date('2026-07-20T15:45:13.774Z');
const REQ: CorrelationContext = { correlationId: 'req-123', kind: 'request' };
const JOB: CorrelationContext = { correlationId: 'job-9', kind: 'job' };

test('parseLogLevel normalises names, aliases log→info, and falls back', () => {
  assert.equal(parseLogLevel('error'), 'error');
  assert.equal(parseLogLevel('WARN'), 'warn');
  assert.equal(parseLogLevel(' Debug '), 'debug');
  assert.equal(parseLogLevel('log'), 'info');
  assert.equal(parseLogLevel(undefined), 'info');
  assert.equal(parseLogLevel(''), 'info');
  assert.equal(parseLogLevel('bogus'), 'info');
  assert.equal(parseLogLevel('bogus', 'warn'), 'warn');
});

test('isLevelEnabled enables the threshold and everything more severe', () => {
  assert.ok(isLevelEnabled('error', 'info'));
  assert.ok(isLevelEnabled('warn', 'info'));
  assert.ok(isLevelEnabled('info', 'info'));
  assert.ok(!isLevelEnabled('debug', 'info'));
  assert.ok(!isLevelEnabled('verbose', 'info'));
  assert.ok(isLevelEnabled('verbose', 'verbose'));
});

test('formatLogEntry emits structured fields', () => {
  const record = formatLogEntry(
    { level: 'info', message: 'hello', context: 'Bootstrap' },
    FIXED,
  );
  assert.equal(record.time, '2026-07-20T15:45:13.774Z');
  assert.equal(record.level, 'info');
  assert.equal(record.message, 'hello');
  assert.equal(record.context, 'Bootstrap');
  assert.equal(record.correlationId, undefined);
});

test('formatLogEntry stringifies non-string messages and keeps stacks', () => {
  assert.equal(
    formatLogEntry({ level: 'info', message: { a: 1 } }, FIXED).message,
    '{"a":1}',
  );
  const err = formatLogEntry(
    { level: 'error', message: 'boom', stack: 'Error: boom\n  at x' },
    FIXED,
  );
  assert.equal(err.message, 'boom');
  assert.equal(err.stack, 'Error: boom\n  at x');
});

test('formatLogEntry folds a request correlation id into requestId', () => {
  const record = formatLogEntry(
    { level: 'info', message: 'in request' },
    FIXED,
    REQ,
  );
  assert.equal(record.correlationId, 'req-123');
  assert.equal(record.requestId, 'req-123');
  assert.equal(record.jobId, undefined);
});

test('formatLogEntry aliases a job correlation id as jobId', () => {
  const record = formatLogEntry(
    { level: 'info', message: 'in job' },
    FIXED,
    JOB,
  );
  assert.equal(record.correlationId, 'job-9');
  assert.equal(record.jobId, 'job-9');
  assert.equal(record.requestId, undefined);
});

test('StructuredLogger writes JSON to stdout for info-level logs', () => {
  const { sink, stdout, stderr } = captureSink();
  const logger = new StructuredLogger({ now: () => FIXED, sink });
  logger.log('server up', 'Bootstrap');
  assert.equal(stderr.length, 0);
  assert.equal(stdout.length, 1);
  const parsed = JSON.parse(stdout[0]);
  assert.equal(parsed.level, 'info');
  assert.equal(parsed.message, 'server up');
  assert.equal(parsed.context, 'Bootstrap');
  assert.equal(parsed.time, '2026-07-20T15:45:13.774Z');
});

test('StructuredLogger routes warn/error to stderr and carries the stack', () => {
  const { sink, stdout, stderr } = captureSink();
  const logger = new StructuredLogger({ now: () => FIXED, sink });
  logger.warn('careful', 'Ctx');
  logger.error('kaboom', 'Error: kaboom\n  at y', 'Ctx');
  assert.equal(stdout.length, 0);
  assert.equal(stderr.length, 2);
  const errRecord = JSON.parse(stderr[1]);
  assert.equal(errRecord.level, 'error');
  assert.equal(errRecord.message, 'kaboom');
  assert.equal(errRecord.stack, 'Error: kaboom\n  at y');
});

test('StructuredLogger drops levels below the configured threshold', () => {
  const { sink, stdout } = captureSink();
  const logger = new StructuredLogger({ level: 'warn', now: () => FIXED, sink });
  logger.log('noisy');
  logger.debug('noisier');
  assert.equal(stdout.length, 0);
});

test('correlation id propagates from the active scope into log lines', () => {
  const { sink, stdout } = captureSink();
  // Wire the logger to the real AsyncLocalStorage-backed store, exactly as the
  // production factory does, then log from inside a correlation scope.
  const logger = new StructuredLogger({
    now: () => FIXED,
    sink,
    getContext: getCorrelationContext,
  });
  runWithCorrelation({ correlationId: 'abc-42', kind: 'request' }, () => {
    logger.log('handled request', 'Http');
  });
  const parsed = JSON.parse(stdout[0]);
  assert.equal(parsed.correlationId, 'abc-42');
  assert.equal(parsed.requestId, 'abc-42');
});

test('serializeLog produces a single JSON line', () => {
  const line = serializeLog(
    formatLogEntry({ level: 'info', message: 'x' }, FIXED),
  );
  assert.doesNotThrow(() => JSON.parse(line));
  assert.ok(!line.includes('\n'));
});
