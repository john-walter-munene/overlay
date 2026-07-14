import { Controller, Get, Header } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { METRICS_CONTENT_TYPE, metrics } from '../../common/metrics';

/**
 * Prometheus scrape endpoint (OB-093). Exposes the process-wide SLI metrics
 * (settlement latency, webhook failures, queue depth, error rate) in the text
 * exposition format. Excluded from rate limiting so scrapers are never
 * throttled; keep it on the internal network / behind auth at the ingress.
 */
@Controller('metrics')
@SkipThrottle()
export class MetricsController {
  @Get()
  @Header('Content-Type', METRICS_CONTENT_TYPE)
  scrape(): string {
    return metrics.render();
  }
}
