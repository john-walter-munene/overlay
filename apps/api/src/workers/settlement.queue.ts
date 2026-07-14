import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';
import { Logger } from '@nestjs/common';
import type { SettlementService } from './settlement.service';
import { queueDepth } from '../common/metrics';

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

  // OB-093: publish queue depth (waiting + delayed jobs) as a gauge so a
  // growing backlog trips the queue-depth SLO alert. Sampled on each event and
  // on a low-frequency timer so depth is fresh even when the queue is idle.
  const sampleDepth = async () => {
    try {
      const counts = await queue.getJobCounts('waiting', 'delayed');
      queueDepth.set(
        (counts.waiting ?? 0) + (counts.delayed ?? 0),
        { queue: SETTLEMENT_QUEUE },
      );
    } catch (err) {
      log.debug(`queue depth sample failed: ${(err as Error).message}`);
    }
  };
  const depthTimer = setInterval(() => void sampleDepth(), 15_000);
  depthTimer.unref?.();

  worker.on('failed', (job, err) => {
    log.error(`Settlement cycle failed (job ${job?.id})`, err.stack);
    void sampleDepth();
  });
  worker.on('completed', () => {
    log.debug('Settlement cycle completed');
    void sampleDepth();
  });
  void sampleDepth();

  log.log(`Settlement queue started; repeat every ${intervalMs}ms`);
  return { queue, worker, connection };
}
