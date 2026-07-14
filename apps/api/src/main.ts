import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { validateEnv } from './common/config';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import { SettlementService } from './workers/settlement.service';

async function bootstrap() {
  validateEnv();

  // rawBody: true preserves the exact request bytes on req.rawBody so payment
  // webhook signatures (Stripe) can be verified against the untouched payload.
  const app = await NestFactory.create(AppModule, { rawBody: true });

  app.setGlobalPrefix('api');
  app.use(helmet());

  // CORS: allow the configured origins (comma-separated, trailing-slash and
  // whitespace tolerant) plus — unless disabled — any *.vercel.app origin so
  // Vercel per-deployment PREVIEW URLs work without reconfiguring on each deploy.
  // Lock this down for production by setting ALLOW_VERCEL_PREVIEWS=false and an
  // explicit CORS_ORIGINS list (see OB-083).
  const allowedOrigins = (process.env.CORS_ORIGINS ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  const allowVercelPreviews = process.env.ALLOW_VERCEL_PREVIEWS !== 'false';
  const vercelHost = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

  app.enableCors({
    origin: (origin, callback) => {
      // Non-browser requests (curl, server-to-server) send no Origin.
      if (!origin) return callback(null, true);
      const normalized = origin.replace(/\/+$/, '');
      const ok =
        allowedOrigins.includes(normalized) ||
        (allowVercelPreviews && vercelHost.test(normalized));
      return callback(ok ? null : new Error('Not allowed by CORS'), ok);
    },
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  await app.listen(port, '0.0.0.0');
  new Logger('Bootstrap').log(`Overlay API listening on :${port}`);

  // Free-tier staging: run the settlement loop inside the API instead of a
  // dedicated worker service (Render workers need a paid instance). A spun-down
  // free web service pauses settlement until the next request. For production,
  // disable this and run the dedicated `overlay-worker` service (see OB-143).
  if (process.env.EMBED_WORKER === 'true') {
    const settlement = app.get(SettlementService);
    const intervalMs = Number(process.env.WORKER_INTERVAL_MS ?? 60_000);
    const log = new Logger('EmbeddedWorker');
    const tick = async () => {
      try {
        await settlement.runOnce();
      } catch (err) {
        log.error('settlement cycle failed', err as Error);
      }
    };
    void tick();
    setInterval(tick, intervalMs);
    log.log(`Embedded settlement worker running (every ${intervalMs}ms)`);
  }
}

bootstrap();
