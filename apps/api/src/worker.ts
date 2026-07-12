import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SettlementService } from './workers/settlement.service';
import { startSettlementQueue } from './workers/settlement.queue';

/**
 * Worker entrypoint (docs/ARCHITECTURE.md §3.3). Runs the settlement pipeline
 * separately from the HTTP API.
 *
 * Two modes, selected by WORKER_MODE:
 *   - "queue"    → BullMQ repeatable job + worker (production; needs Redis).
 *   - "interval" → in-process setInterval loop (default; zero infra for dev).
 */
async function main() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const settlement = app.get(SettlementService);
  const mode = process.env.WORKER_MODE ?? 'interval';

  if (mode === 'queue') {
    const { worker, queue, connection } = await startSettlementQueue(settlement);
    const shutdown = async () => {
      await worker.close();
      await queue.close();
      connection.disconnect();
      await app.close();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
    return;
  }

  const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);
  // eslint-disable-next-line no-console
  console.log(`Overlay worker (interval mode); cycle every ${intervalMs}ms`);

  const tick = async () => {
    try {
      await settlement.runOnce();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('settlement cycle failed', err);
    }
  };

  await tick();
  setInterval(tick, intervalMs);
}

main();
