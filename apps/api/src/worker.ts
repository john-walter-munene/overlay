import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SettlementService } from './workers/settlement.service';
import { startSettlementQueue } from './workers/settlement.queue';
import { NotificationsService } from './modules/notifications/notifications.service';

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

  // Daily digest fan-out (OB-033): batches new picks for daily-cadence users
  // into a single email per cycle. Defaults to every 24h.
  const notifications = app.get(NotificationsService);
  const digestMs = Number(process.env.DIGEST_INTERVAL_MS ?? 24 * 60 * 60_000);
  const digestTick = async () => {
    try {
      const sent = await notifications.sendDailyDigests(
        new Date(Date.now() - digestMs),
      );
      // eslint-disable-next-line no-console
      console.log(`digest cycle sent ${sent} email(s)`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('digest cycle failed', err);
    }
  };
  setInterval(digestTick, digestMs);
}

main();
