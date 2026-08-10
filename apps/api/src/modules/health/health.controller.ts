import { Controller, Get, OnModuleDestroy, Res } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import type { Response } from 'express';
import IORedis from 'ioredis';
import { PrismaService } from '../../prisma.service';
import { evaluateReadiness } from './health.checks';

/**
 * Liveness/readiness probes for load balancers, container orchestrators, and
 * uptime monitors (OB-092). `/health` is a cheap liveness check that never
 * touches a dependency; `/health/ready` verifies the database *and* Redis
 * connectivity and answers 503 when either is down so the orchestrator stops
 * routing traffic here.
 */
@Controller('health')
@SkipThrottle()
export class HealthController implements OnModuleDestroy {
  private readonly startedAt = Date.now();
  private redis?: IORedis;

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  live() {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      timestamp: new Date().toISOString(),
    };
  }

  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response) {
    const result = await evaluateReadiness({
      database: () => this.prisma.$queryRaw`SELECT 1`,
      redis: () => this.pingRedis(),
    });
    res.status(result.status === 'ok' ? 200 : 503);
    return result;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      await this.redis.quit().catch(() => undefined);
      this.redis = undefined;
    }
  }

  /**
   * Ping a lazily-created, shared Redis connection. `lazyConnect` +
   * `enableOfflineQueue: false` mean an unreachable Redis rejects promptly
   * instead of buffering, and the bounded retries/timeout keep the probe fast.
   */
  private pingRedis(): Promise<string> {
    if (!this.redis) {
      const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
      this.redis = new IORedis(url, {
        lazyConnect: true,
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
        connectTimeout: 2_000,
      });
      // Swallow async connection errors; the probe surfaces them via `ping()`.
      this.redis.on('error', () => undefined);
    }
    return this.redis.ping();
  }
}
