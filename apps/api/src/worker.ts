import 'reflect-metadata';
import { createServer } from 'node:http';
import { NestFactory } from '@nestjs/core';
import { loadDotenv } from './common/load-env';
import { AppModule } from './app.module';
import { createLogger } from './common/logging/logger.factory';
import {
  newCorrelationId,
  runWithCorrelation,
} from './common/logging/correlation';
import { SettlementService } from './workers/settlement.service';
import { startSettlementQueue } from './workers/settlement.queue';
import { METRICS_CONTENT_TYPE, metrics } from './common/metrics';
import { NotificationsService } from './modules/notifications/notifications.service';
import { NewsletterService } from './modules/newsletter/newsletter.service';
import { EventsService } from './modules/events/events.service';

/**
 * Worker entrypoint (docs/ARCHITECTURE.md §3.3). Runs the settlement pipeline
 * separately from the HTTP API.
 *
 * Two modes, selected by WORKER_MODE:
 *   - "queue"    → BullMQ repeatable job + worker (production; needs Redis).
 *   - "interval" → in-process setInterval loop (default; zero infra for dev).
 */
async function main() {
  loadDotenv();
  const app = await NestFactory.createApplicationContext(AppModule, {
    bufferLogs: true,
  });
  // Structured JSON logging + correlation ids (OB-091), shared with the API.
  const logger = createLogger();
  app.useLogger(logger);
  const settlement = app.get(SettlementService);
  const mode = process.env.WORKER_MODE ?? 'interval';

  if (mode === 'queue') {
    const { worker, queue, connection } = await startSettlementQueue(settlement);

    // Expose the worker's own metrics (queue depth, settlement latency) so
    // Prometheus can scrape this process too — the API only sees cycles it runs
    // itself. Disabled by setting WORKER_METRICS_PORT=0 (see infra/monitoring).
    const metricsPort = Number(process.env.WORKER_METRICS_PORT ?? 9100);
    const metricsServer =
      metricsPort > 0
        ? createServer((req, res) => {
            if (req.url === '/metrics') {
              res.writeHead(200, { 'Content-Type': METRICS_CONTENT_TYPE });
              res.end(metrics.render());
            } else {
              res.writeHead(404).end();
            }
          }).listen(metricsPort, '0.0.0.0')
        : null;

    const shutdown = async () => {
      metricsServer?.close();
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
  logger.log(
    `Overlay worker (interval mode); cycle every ${intervalMs}ms`,
    'Worker',
  );

  // Each cycle runs inside a fresh job correlation id (OB-091) so every log
  // line it emits — here and in the services it calls — shares a `jobId`, and a
  // failure is logged as structured JSON rather than a bare console.error.
  const runJob = (name: string, fn: () => Promise<void>) =>
    runWithCorrelation(
      { correlationId: newCorrelationId(), kind: 'job' },
      async () => {
        try {
          await fn();
        } catch (err) {
          logger.error(
            `${name} failed`,
            err instanceof Error ? err.stack : String(err),
            'Worker',
          );
        }
      },
    );

  const tick = () => runJob('settlement cycle', () => settlement.runOnce());

  await tick();
  setInterval(tick, intervalMs);

  // Scheduled fixture ingestion (OB-045/OB-046): pull the configured sports on
  // an interval so the events table stays fresh without manual admin action.
  // Gated on INGEST_SPORTS so dev/mock without config stays quiet.
  if (process.env.INGEST_SPORTS?.trim()) {
    const events = app.get(EventsService);
    const ingestMs = Number(process.env.INGEST_INTERVAL_MS ?? 15 * 60_000);
    const ingestTick = () =>
      runJob('ingest cycle', async () => {
        const summary = await events.ingestConfigured();
        const total = summary.reduce((n, s) => n + (s.ingested ?? 0), 0);
        logger.log(
          `ingest cycle: ${total} fixture(s) across ${summary.length} sport(s)`,
          'Worker',
        );
      });
    await ingestTick();
    setInterval(ingestTick, ingestMs);
  }

  // Daily digest fan-out (OB-033): batches new picks for daily-cadence users
  // into a single email per cycle. Defaults to every 24h.
  const notifications = app.get(NotificationsService);
  const digestMs = Number(process.env.DIGEST_INTERVAL_MS ?? 24 * 60 * 60_000);
  const digestTick = () =>
    runJob('digest cycle', async () => {
      const sent = await notifications.sendDailyDigests(
        new Date(Date.now() - digestMs),
      );
      logger.log(`digest cycle sent ${sent} email(s)`, 'Worker');
    });
  setInterval(digestTick, digestMs);

  // Weekly "Picks of the Week" newsletter (OB-157): composes the week's picks
  // into one digest and emails every confirmed newsletter subscriber. Defaults
  // to every 7 days; disable by setting NEWSLETTER_DIGEST_INTERVAL_MS=0.
  const newsletter = app.get(NewsletterService);
  const weeklyMs = Number(
    process.env.NEWSLETTER_DIGEST_INTERVAL_MS ?? 7 * 24 * 60 * 60_000,
  );
  if (weeklyMs > 0) {
    const weeklyTick = () =>
      runJob('newsletter digest cycle', async () => {
        const { sent, picks } = await newsletter.sendWeeklyDigest(weeklyMs);
        logger.log(
          `newsletter digest cycle sent ${sent} email(s) for ${picks} pick(s)`,
          'Worker',
        );
      });
    setInterval(weeklyTick, weeklyMs);
  }
}

main();
