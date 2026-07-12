import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Logger } from '@nestjs/common';
import type { SettlementService } from './settlement.service';

export const SETTLEMENT_QUEUE = 'settlement';
export const SETTLEMENT_JOB = 'run-cycle';

/**
 * Build a BullMQ connection from REDIS_URL. `maxRetriesPerRequest: null` is
 * required by BullMQ's blocking commands.
 */
export function createRedisConnection(): IORedis {
  const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
  return new IORedis(url, { maxRetriesPerRequest: null });
}

/**
 * Start the settlement pipeline as a BullMQ repeatable job + worker.
 * Returns handles so the caller can close them on shutdown.
 *
 * The queue holds a single repeatable job (every WORKER_INTERVAL_MS); the
 * worker processes each tick by running one idempotent settlement cycle.
 * Concurrency is pinned to 1 so cycles never overlap.
 */
export async function startSettlementQueue(
  settlement: SettlementService,
): Promise<{ queue: Queue; worker: Worker; connection: IORedis }> {
  const log = new Logger('SettlementQueue');
  const connection = createRedisConnection();

  const queue = new Queue(SETTLEMENT_QUEUE, { connection });
  const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);

  // Idempotent scheduler registration: clear stale repeatables, then add ours.
  const existing = await queue.getRepeatableJobs();
  await Promise.all(existing.map((r) => queue.removeRepeatableByKey(r.key)));
  await queue.add(
    SETTLEMENT_JOB,
    {},
    {
      repeat: { every: intervalMs },
      removeOnComplete: 50,
      removeOnFail: 100,
    },
  );

  const worker = new Worker(
    SETTLEMENT_QUEUE,
    async () => {
      await settlement.runOnce();
    },
    { connection, concurrency: 1 },
  );

  worker.on('failed', (job, err) => {
    log.error(`Settlement cycle failed (job ${job?.id})`, err.stack);
  });
  worker.on('completed', () => log.debug('Settlement cycle completed'));

  log.log(`Settlement queue started; repeat every ${intervalMs}ms`);
  return { queue, worker, connection };
}
