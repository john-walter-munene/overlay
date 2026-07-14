import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  Counter,
  Gauge,
  Histogram,
  MetricsRegistry,
  metrics,
  recordSettlementCycle,
  settlementCycleDuration,
  settlementCyclesTotal,
  settlementPicksSettledTotal,
} from './metrics.ts';

test('Counter increments and renders per-label series', () => {
  const c = new Counter('demo_total', 'demo help');
  c.inc();
  c.inc({ result: 'failed' }, 3);
  assert.equal(c.get(), 1);
  assert.equal(c.get({ result: 'failed' }), 3);
  const out = c.render().join('\n');
  assert.match(out, /# HELP demo_total demo help/);
  assert.match(out, /# TYPE demo_total counter/);
  assert.match(out, /^demo_total 1$/m);
  assert.match(out, /^demo_total\{result="failed"\} 3$/m);
});

test('Counter renders a zero sample when it has no observations', () => {
  const c = new Counter('empty_total', 'help');
  assert.match(c.render().join('\n'), /^empty_total 0$/m);
});

test('Counter rejects negative increments', () => {
  const c = new Counter('demo_total', 'help');
  assert.throws(() => c.inc({}, -1), /can only increase/);
});

test('Gauge supports set/inc/dec', () => {
  const g = new Gauge('depth', 'help');
  g.set(5, { queue: 'settlement' });
  g.inc({ queue: 'settlement' });
  g.dec({ queue: 'settlement' }, 2);
  assert.equal(g.get({ queue: 'settlement' }), 4);
  assert.match(g.render().join('\n'), /^depth\{queue="settlement"\} 4$/m);
});

test('Histogram renders cumulative buckets, sum and count', () => {
  const h = new Histogram('lat_seconds', 'help', [1, 5, 10]);
  h.observe(0.5);
  h.observe(3);
  h.observe(30);
  assert.equal(h.count(), 3);
  const out = h.render().join('\n');
  // 0.5 <= 1; 3 <= 5; only the first two fall under le=5.
  assert.match(out, /^lat_seconds_bucket\{le="1"\} 1$/m);
  assert.match(out, /^lat_seconds_bucket\{le="5"\} 2$/m);
  assert.match(out, /^lat_seconds_bucket\{le="10"\} 2$/m);
  assert.match(out, /^lat_seconds_bucket\{le="\+Inf"\} 3$/m);
  assert.match(out, /^lat_seconds_sum 33\.5$/m);
  assert.match(out, /^lat_seconds_count 3$/m);
});

test('Histogram sorts and de-duplicates buckets', () => {
  const h = new Histogram('h', 'help', [10, 1, 5, 5]);
  assert.deepEqual(h.buckets, [1, 5, 10]);
});

test('label values are escaped in the exposition', () => {
  const c = new Counter('x_total', 'help');
  c.inc({ path: 'a"b\\c' });
  assert.match(c.render().join('\n'), /x_total\{path="a\\"b\\\\c"\} 1/);
});

test('MetricsRegistry renders all metrics with a trailing newline', () => {
  const reg = new MetricsRegistry();
  reg.counter('a_total', 'a').inc();
  reg.gauge('b', 'b').set(2);
  const out = reg.render();
  assert.ok(out.endsWith('\n'));
  assert.match(out, /a_total 1/);
  assert.match(out, /^b 2$/m);
});

// Integration (OB-093 acceptance test): a metric is emitted for a settlement
// cycle. recordSettlementCycle is exactly what the settlement pipeline calls at
// the end of runOnce(), so exercising it proves the cycle metrics are wired.
test('recordSettlementCycle emits settlement metrics for a cycle', () => {
  const cyclesBefore = settlementCyclesTotal.get({ outcome: 'success' });
  const picksBefore = settlementPicksSettledTotal.get();
  const durationsBefore = settlementCycleDuration.count();

  recordSettlementCycle({ durationSeconds: 1.5, settledPicks: 4, ok: true });

  assert.equal(settlementCyclesTotal.get({ outcome: 'success' }), cyclesBefore + 1);
  assert.equal(settlementPicksSettledTotal.get(), picksBefore + 4);
  assert.equal(settlementCycleDuration.count(), durationsBefore + 1);

  const scrape = metrics.render();
  assert.match(scrape, /overlay_settlement_cycle_duration_seconds_count \d+/);
  assert.match(scrape, /overlay_settlement_cycles_total\{outcome="success"\} \d+/);
  assert.match(scrape, /overlay_settlement_picks_settled_total \d+/);
});

test('recordSettlementCycle records failures without counting picks', () => {
  const failBefore = settlementCyclesTotal.get({ outcome: 'failure' });
  const picksBefore = settlementPicksSettledTotal.get();

  recordSettlementCycle({ durationSeconds: 0.2, settledPicks: 0, ok: false });

  assert.equal(settlementCyclesTotal.get({ outcome: 'failure' }), failBefore + 1);
  assert.equal(settlementPicksSettledTotal.get(), picksBefore);
});
