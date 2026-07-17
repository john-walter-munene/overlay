
The API and settlement worker emit Prometheus metrics that back a small set of
Service Level Objectives (SLOs). Prometheus scrapes them, evaluates the alert
rules, and Alertmanager pages on-call when an SLO is breached.

## Metrics endpoint

`GET /api/metrics` returns the Prometheus text exposition format
(`Content-Type: text/plain; version=0.0.4`). The endpoint is unauthenticated and
excluded from rate limiting, so keep it on the internal network or protect it at
the ingress. The registry lives in
[`apps/api/src/common/metrics.ts`](../apps/api/src/common/metrics.ts) and is
instrumented at the points below.

| Metric | Type | Labels | Source |
| --- | --- | --- | --- |
| `overlay_settlement_cycle_duration_seconds` | histogram | — | `SettlementService.runOnce` |
| `overlay_settlement_cycles_total` | counter | `outcome` | `SettlementService.runOnce` |
| `overlay_settlement_picks_settled_total` | counter | — | `SettlementService.settlePicks` |
| `overlay_webhook_events_total` | counter | `result` | `SubscriptionsService.applyWebhook` |
| `overlay_queue_depth` | gauge | `queue` | `startSettlementQueue` (BullMQ) |
| `overlay_http_errors_total` | counter | `status` | `AllExceptionsFilter` |

## Health & readiness probes

Liveness/readiness endpoints (OB-092) let the host/orchestrator route traffic
and restart unhealthy instances. They live in
[`apps/api/src/modules/health/health.controller.ts`](../apps/api/src/modules/health/health.controller.ts)
and are excluded from rate limiting.

| Endpoint | Purpose | Checks | Codes |
| --- | --- | --- | --- |
| `GET /api/health` | Liveness — always fast, touches no dependency | — | `200` |
| `GET /api/health/ready` | Readiness — safe to receive traffic | database (`SELECT 1`) + Redis (`PING`) | `200` ready, `503` degraded |

`/api/health/ready` runs both probes concurrently with a short timeout; a slow
or unreachable dependency reads as `down`. It returns `503` with
`{ status: "degraded", checks: { database, redis } }` when either is down so the
orchestrator stops routing to the instance. Render's health check points at
`/api/health` (liveness) — see [`render.yaml`](../render.yaml). The verdict
logic is decorator-free in
[`apps/api/src/modules/health/health.checks.ts`](../apps/api/src/modules/health/health.checks.ts).

## SLOs

| SLO | Objective | SLI (PromQL) | Alert |
| --- | --- | --- | --- |
| Settlement latency | p95 cycle < 30s | `histogram_quantile(0.95, …_duration_seconds_bucket)` | `SettlementCycleLatencyHigh` (page, >60s/10m) |
| Settlement success | cycles don't fail | `increase(…_cycles_total{outcome="failure"}[15m])` | `SettlementCyclesFailing` (page) |
| Settlement freshness | a cycle every few min | `increase(…_cycles_total{outcome="success"}[15m])` | `SettlementStalled` (page) |
| Webhook success | < 5% failures | `failed / total` over 15m | `WebhookFailureRateHigh` (page) |
| Queue depth | small backlog | `overlay_queue_depth{queue="settlement"}` | `SettlementQueueDepthHigh` (ticket, >100/10m) |
| API error rate | few 5xx | `rate(overlay_http_errors_total[5m])` | `ApiErrorRateHigh` (page) |

## Alerting → on-call

Alert rules ([`infra/monitoring/alerts.yml`](../infra/monitoring/alerts.yml))
tag each alert with a `severity`. Alertmanager
([`infra/monitoring/alertmanager.yml`](../infra/monitoring/alertmanager.yml))
routes them so a breach reaches a human:

- `severity: page` → PagerDuty (24/7 on-call paging).
- `severity: ticket` → Slack `#overlay-alerts` (business-hours triage).

Every alert links the on-call runbook (OB-095) via `runbook_url`. Integration
keys are mounted from the secrets manager — never commit real keys.

## Running the stack locally

```bash
# API exposes metrics at http://localhost:4000/api/metrics
npm run build -w @overlay/api && npm run start -w @overlay/api

# Point Prometheus + Alertmanager + Grafana at the config in infra/monitoring/.
# Import infra/monitoring/grafana-dashboard.json for the "Overlay Bets — SLOs"
# dashboard.
```

## Tests

`apps/api/src/common/metrics.test.ts` covers the registry (counter/gauge/
histogram rendering) and the settlement-cycle integration case required by
OB-093: `recordSettlementCycle` — the exact call `runOnce()` makes — emits the
settlement metrics into the exposition. Run with `npm run test:unit`.

`apps/api/src/modules/health/health.checks.test.ts` covers the readiness verdict
and the timeout/failure probe branches (OB-092); the "readiness fails when DB is
down" acceptance case runs against a real Prisma client in
`apps/api/src/modules/health/health.readiness.itest.ts` via
`npm run test:integration`.
