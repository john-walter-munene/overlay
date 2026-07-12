import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma.service';

/**
 * Liveness/readiness probes for load balancers, container orchestrators, and
 * uptime monitors. `/health` is a cheap liveness check; `/health/ready` also
 * verifies the database connection.
 */
@Controller('health')
@SkipThrottle()
export class HealthController {
  private readonly startedAt = Date.now();

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
  async ready() {
    let db = 'ok';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'down';
    }
    const status = db === 'ok' ? 'ok' : 'degraded';
    return { status, checks: { database: db } };
  }
}
