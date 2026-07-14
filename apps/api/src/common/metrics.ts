// Minimal, dependency-free metrics registry (OB-093).
//
// Prometheus is the scrape target of choice (see docs/OBSERVABILITY.md), so this
// module exposes counters/gauges/histograms and renders them in the Prometheus
// text exposition format. It is intentionally decorator-free and side-effect
// free at import time so it can be unit-tested under Node's
// `--experimental-strip-types` runner (see the module-boundary notes in the
// repo memories) and imported from anywhere without pulling in Nest.

/** Ordered, low-cardinality label set attached to a single time series. */
export type Labels = Record<string, string>;

/** Escape a HELP line per the Prometheus text format (backslash + newline). */
function escapeHelp(help: string): string {
  return help.replace(/\\/g, '\\\\').replace(/\n/g, '\\n');
}

/** Escape a label value per the Prometheus text format. */
function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/"/g, '\\"');
}

/** Deterministic `{a="1",b="2"}` rendering; empty labels render as "". */
function renderLabels(labels: Labels, extra?: Labels): string {
  const merged: Labels = { ...labels, ...extra };
  const keys = Object.keys(merged).sort();
  if (keys.length === 0) return '';
  const inner = keys
    .map((k) => `${k}="${escapeLabelValue(merged[k])}"`)
    .join(',');
  return `{${inner}}`;
}

/** Stable key for a label set so repeated observations hit the same series. */
function seriesKey(labels: Labels): string {
  const keys = Object.keys(labels).sort();
  return keys.map((k) => `${k}=${labels[k]}`).join(',');
}

interface Metric {
  readonly name: string;
  render(): string[];
}

/** Monotonically increasing counter (e.g. total webhook failures). */
export class Counter implements Metric {
  readonly name: string;
  private readonly help: string;
  private readonly series = new Map<string, { labels: Labels; value: number }>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  inc(labels: Labels = {}, amount = 1): void {
    if (amount < 0) throw new Error('Counter can only increase');
    const key = seriesKey(labels);
    const existing = this.series.get(key);
    if (existing) existing.value += amount;
    else this.series.set(key, { labels, value: amount });
  }

  get(labels: Labels = {}): number {
    return this.series.get(seriesKey(labels))?.value ?? 0;
  }

  render(): string[] {
    const lines = [
      `# HELP ${this.name} ${escapeHelp(this.help)}`,
      `# TYPE ${this.name} counter`,
    ];
    if (this.series.size === 0) {
      lines.push(`${this.name} 0`);
      return lines;
    }
    for (const { labels, value } of this.series.values()) {
      lines.push(`${this.name}${renderLabels(labels)} ${value}`);
    }
    return lines;
  }
}

/** Instantaneous value that can go up or down (e.g. queue depth). */
export class Gauge implements Metric {
  readonly name: string;
  private readonly help: string;
  private readonly series = new Map<string, { labels: Labels; value: number }>();

  constructor(name: string, help: string) {
    this.name = name;
    this.help = help;
  }

  set(value: number, labels: Labels = {}): void {
    this.series.set(seriesKey(labels), { labels, value });
  }

  inc(labels: Labels = {}, amount = 1): void {
    this.set(this.get(labels) + amount, labels);
  }

  dec(labels: Labels = {}, amount = 1): void {
    this.set(this.get(labels) - amount, labels);
  }

  get(labels: Labels = {}): number {
    return this.series.get(seriesKey(labels))?.value ?? 0;
  }

  render(): string[] {
    const lines = [
      `# HELP ${this.name} ${escapeHelp(this.help)}`,
      `# TYPE ${this.name} gauge`,
    ];
    if (this.series.size === 0) {
      lines.push(`${this.name} 0`);
      return lines;
    }
    for (const { labels, value } of this.series.values()) {
      lines.push(`${this.name}${renderLabels(labels)} ${value}`);
    }
    return lines;
  }
}

interface HistogramSeries {
  labels: Labels;
  counts: number[];
  sum: number;
  count: number;
}

/** Cumulative histogram used for latency SLIs (e.g. settlement duration). */
export class Histogram implements Metric {
  readonly name: string;
  private readonly help: string;
  private readonly series = new Map<string, HistogramSeries>();
  readonly buckets: number[];

  constructor(name: string, help: string, buckets: number[]) {
    this.name = name;
    this.help = help;
    // Ascending, de-duplicated upper bounds; +Inf is implicit.
    this.buckets = [...new Set(buckets)].sort((a, b) => a - b);
  }

  observe(value: number, labels: Labels = {}): void {
    const key = seriesKey(labels);
    let s = this.series.get(key);
    if (!s) {
      s = { labels, counts: new Array(this.buckets.length).fill(0), sum: 0, count: 0 };
      this.series.set(key, s);
    }
    s.sum += value;
    s.count += 1;
    for (let i = 0; i < this.buckets.length; i++) {
      if (value <= this.buckets[i]) s.counts[i] += 1;
    }
  }

  /** Total number of observations for a label set (used in tests). */
  count(labels: Labels = {}): number {
    return this.series.get(seriesKey(labels))?.count ?? 0;
  }

  render(): string[] {
    const lines = [
      `# HELP ${this.name} ${escapeHelp(this.help)}`,
      `# TYPE ${this.name} histogram`,
    ];
    for (const s of this.series.values()) {
      for (let i = 0; i < this.buckets.length; i++) {
        lines.push(
          `${this.name}_bucket${renderLabels(s.labels, {
            le: String(this.buckets[i]),
          })} ${s.counts[i]}`,
        );
      }
      lines.push(
        `${this.name}_bucket${renderLabels(s.labels, { le: '+Inf' })} ${s.count}`,
      );
      lines.push(`${this.name}_sum${renderLabels(s.labels)} ${s.sum}`);
      lines.push(`${this.name}_count${renderLabels(s.labels)} ${s.count}`);
    }
    return lines;
  }
}

/** Holds every registered metric and renders the full exposition payload. */
export class MetricsRegistry {
  private readonly metrics: Metric[] = [];

  counter(name: string, help: string): Counter {
    const c = new Counter(name, help);
    this.metrics.push(c);
    return c;
  }

  gauge(name: string, help: string): Gauge {
    const g = new Gauge(name, help);
    this.metrics.push(g);
    return g;
  }

  histogram(name: string, help: string, buckets: number[]): Histogram {
    const h = new Histogram(name, help, buckets);
    this.metrics.push(h);
    return h;
  }

  /** Prometheus text exposition (v0.0.4). Trailing newline is required. */
  render(): string {
    return this.metrics.flatMap((m) => m.render()).join('\n') + '\n';
  }
}

/** Content-Type for the Prometheus text exposition format. */
export const METRICS_CONTENT_TYPE = 'text/plain; version=0.0.4; charset=utf-8';

/**
 * Process-wide registry and the SLI metrics named in OB-093
 * (settlement latency, webhook failures, queue depth, error rate).
 */
export const metrics = new MetricsRegistry();

/** Settlement cycle wall-clock duration — the settlement latency SLI. */
export const settlementCycleDuration = metrics.histogram(
  'overlay_settlement_cycle_duration_seconds',
  'Wall-clock duration of one settlement cycle (runOnce), in seconds.',
  [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
);

/** Settlement cycles by outcome — powers the settlement error-rate SLI. */
export const settlementCyclesTotal = metrics.counter(
  'overlay_settlement_cycles_total',
  'Settlement cycles run, labelled by outcome (success|failure).',
);

/** Picks graded across all settlement cycles — proves the pipeline is live. */
export const settlementPicksSettledTotal = metrics.counter(
  'overlay_settlement_picks_settled_total',
  'Total picks graded/settled by the settlement pipeline.',
);

/** Payment provider webhook outcomes — powers the webhook-failure SLI. */
export const webhookEventsTotal = metrics.counter(
  'overlay_webhook_events_total',
  'Payment webhook deliveries, labelled by result (handled|failed).',
);

/** Depth of a background queue (e.g. settlement) at last observation. */
export const queueDepth = metrics.gauge(
  'overlay_queue_depth',
  'Number of jobs waiting in a background queue, labelled by queue.',
);

/** HTTP responses by status class — powers the API error-rate SLI. */
export const httpErrorsTotal = metrics.counter(
  'overlay_http_errors_total',
  'HTTP error responses (>=500) served by the API, labelled by status.',
);

/**
 * Record the result of one settlement cycle in a single call. Used by the
 * settlement pipeline and exercised directly by the metrics integration test.
 */
export function recordSettlementCycle(input: {
  durationSeconds: number;
  settledPicks: number;
  ok: boolean;
}): void {
  settlementCycleDuration.observe(input.durationSeconds);
  settlementCyclesTotal.inc({ outcome: input.ok ? 'success' : 'failure' });
  if (input.settledPicks > 0) {
    settlementPicksSettledTotal.inc({}, input.settledPicks);
  }
}
