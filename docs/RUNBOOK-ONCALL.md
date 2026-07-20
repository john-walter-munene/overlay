# On-call runbook & incident process (OB-095)

What to do when an alert fires. This is the page a responder opens at 3am: how
we escalate, and step-by-step runbooks for the four incidents most likely to
wake someone — **settlement stuck**, **webhook backlog**, **vendor outage**, and
**payout failure**.

- **Scope:** production incidents for the Overlay Bets API + settlement worker
  (Postgres source of truth, Redis/BullMQ queue, Stripe payments, a sports
  odds/results vendor).
- **Owner:** whoever is on-call for ops.
- **Related:** [OBSERVABILITY.md](./OBSERVABILITY.md) (metrics/SLOs/alerts),
  [DR-RUNBOOK.md](./DR-RUNBOOK.md) (database recovery),
  [RUNBOOK-SECRETS.md](./RUNBOOK-SECRETS.md) (secret rotation),
  [`infra/monitoring/alerts.yml`](../infra/monitoring/alerts.yml) (alert rules).

## Escalation path

Alerts carry a `severity` label; Alertmanager
([`infra/monitoring/alertmanager.yml`](../infra/monitoring/alertmanager.yml))
routes each to a human so a breach never sits silently:

| Severity | Channel | Expectation |
| --- | --- | --- |
| `page` | PagerDuty (24/7 on-call) | Acknowledge within **5 min**; a user-facing SLO is at risk. |
| `ticket` | Slack `#overlay-alerts` | Triage next **business day**; degradation, not an outage. |

Escalate up the ladder when the primary responder can't acknowledge, or the
incident isn't mitigated within the target below:

1. **Primary on-call** (PagerDuty rotation) — first responder for every `page`.
2. **Secondary on-call** — auto-paged if the primary doesn't ack in **10 min**.
3. **Ops/engineering lead** — page for a P0 (data loss risk, full outage, or
   anything unresolved after **30 min**), or when a change/rollback is needed.
4. **Vendor support** — Postgres/Redis host, Stripe, or the sports data vendor
   when the root cause is on their side (see each runbook below).

Declare a **P0** for: suspected data loss or corruption, the API fully down, or
money moving incorrectly (double payouts, wrong amounts). For P0 also open an
incident channel and pull in the ops lead immediately, and — if the database is
involved — follow [DR-RUNBOOK.md](./DR-RUNBOOK.md).

## Incident lifecycle

1. **Acknowledge** the page so the rotation knows it's owned.
2. **Assess** — is a user actually affected, and how badly? Set the severity.
3. **Mitigate first, diagnose second.** Stop the bleeding (roll back, fail over
   to the mock provider, scale the worker) before hunting root cause.
4. **Communicate** — post status in the incident channel; update on material
   change.
5. **Resolve** — confirm the alert clears and the SLO recovers.
6. **Follow up** — for any `page`, write a short postmortem (timeline, root
   cause, action items). Blameless; the goal is a durable fix, not blame.

## First 5 minutes (any alert)

```bash
# Is the API up and are its dependencies healthy?
curl -s https://<api-host>/api/health           # liveness — always 200 if the process is up
curl -s https://<api-host>/api/health/ready      # readiness — 200 ok, 503 if DB or Redis is down

# What do the SLO metrics say right now?
curl -s https://<api-host>/api/metrics | grep -E 'overlay_(settlement|webhook|queue|http)'
```

`/api/health/ready` returns `{ status, checks: { database, redis } }`; a `503`
points you straight at the failing dependency (see
[OBSERVABILITY.md](./OBSERVABILITY.md#health--readiness-probes)). Logs are
structured JSON with a `correlationId`/`jobId` per request or worker cycle — grep
the id to trace one cycle end to end. Raise verbosity with `LOG_LEVEL=debug` if
needed (`error|warn|info|debug|verbose`).

---

## Runbook: settlement stuck

**Alerts:** `SettlementStalled`, `SettlementCyclesFailing`,
`SettlementCycleLatencyHigh` (all `severity: page`).

**Symptom:** picks aren't being graded — no successful settlement cycle recently,
cycles failing, or p95 cycle latency > 60s.

The worker ([`apps/api/src/worker.ts`](../apps/api/src/worker.ts)) runs
`SettlementService.runOnce`
([`apps/api/src/workers/settlement.service.ts`](../apps/api/src/workers/settlement.service.ts)):
`captureClosingOdds → refreshLiveScores → settlePicks → computeClv →
recomputeStats`. In production `WORKER_MODE=queue` drives it from a BullMQ
repeatable job on the `settlement` queue every `WORKER_INTERVAL_MS` (default
60s); `interval` mode is an in-process loop for dev.

**Diagnose**

1. Metrics — `overlay_settlement_cycles_total{outcome="success"}` should keep
   climbing; `{outcome="failure"}` should be flat. `overlay_queue_depth{queue="settlement"}`
   shows the BullMQ backlog.
2. Worker logs — each cycle logs under one `jobId`. A repeating stack trace is
   your root cause (common: DB unreachable, a vendor error bubbling up from
   `captureClosingOdds`/`refreshLiveScores`, or a bad migration).
3. Is the worker process alive and connected to Redis? A dead worker or an
   unreachable `REDIS_URL` means jobs queue but never run (depth climbs, success
   count flat).

**Mitigate**

- **Worker down / wedged:** restart the worker service. `startSettlementQueue`
  clears stale repeatables and re-registers a fresh one on boot, so a restart
  self-heals a lost schedule; `settlePicks` only transitions still-pending picks,
  so re-running a cycle is safe (idempotent).
- **Redis unreachable:** fix `REDIS_URL` / the Redis host. The queue drains once
  connectivity returns — Redis is a disposable backend; the backlog is
  reconstructable from Postgres.
- **A cycle step is failing on vendor data:** see *vendor outage* below; fall
  back to `SPORTS_API_PROVIDER=mock` to keep grading fixtures that already have
  results while the vendor recovers.
- **DB unreachable / corrupt:** treat as P0 and go to
  [DR-RUNBOOK.md](./DR-RUNBOOK.md).

**Verify:** `overlay_settlement_cycles_total{outcome="success"}` increments,
queue depth falls, and the alert clears.

---

## Runbook: webhook backlog

**Alert:** `WebhookFailureRateHigh` (`severity: page`) — >5% of payment webhooks
failed over 15m.

**Symptom:** subscriptions/refunds aren't being applied because payment webhooks
are failing verification or handling.

Webhooks land at `POST /api/subscriptions/webhook` (default provider) or
`/api/subscriptions/webhook/:provider`
([`subscriptions.controller.ts`](../apps/api/src/modules/subscriptions/subscriptions.controller.ts))
and flow through `SubscriptionsService.applyWebhook`. Stripe signatures are
verified with `STRIPE_WEBHOOK_SECRET`; each handled event is recorded in the
funds ledger keyed on a unique `reference`, so a re-delivered webhook is a
no-op (idempotent). Every event increments
`overlay_webhook_events_total{result="handled"|"failed"}`.

**Diagnose**

1. Metrics — the `result="failed"` split of `overlay_webhook_events_total` tells
   you the failure share.
2. API logs — signature failures and missing-secret warnings log from the Stripe
   provider. A wave of *signature* failures almost always means
   `STRIPE_WEBHOOK_SECRET` is wrong/rotated or `PAYMENTS_PROVIDER` is
   misconfigured; *handler* errors point at the DB or a code path.
3. Provider dashboard — Stripe → Developers → Webhooks shows delivery attempts,
   response codes, and lets you resend.

**Mitigate**

- **Wrong/rotated signing secret:** set the correct `STRIPE_WEBHOOK_SECRET`
  (from the Stripe dashboard) and redeploy. Then **resend** the failed events
  from Stripe — handling is idempotent, so replays are safe.
- **Handler erroring (DB, etc.):** fix the dependency. Stripe retries failed
  deliveries automatically for ~3 days, so a backlog drains itself once handling
  succeeds; force it sooner by resending from the dashboard.
- **Endpoint unreachable / 5xx:** confirm `/api/health/ready` is `200` and the
  ingress routes `/api/subscriptions/webhook*`.

**Verify:** the failed-result rate drops below 5% and the alert clears; spot-check
that a recently-paid subscription is now `active`.

> Note: there is no dead-letter queue — we rely on Stripe's retries plus
> idempotent replay. Don't hand-mutate subscription rows; resend the webhook so
> the ledger stays the single source of truth.

---

## Runbook: vendor outage (sports odds/results)

**Alerts:** usually surfaces as `SettlementCyclesFailing`/`SettlementStalled`, or
elevated `overlay_http_errors_total` on ingest paths.

**Symptom:** the sports data vendor is down, rate-limiting, or returning bad
data, so fixtures/odds/results stop flowing and settlement can't complete.

The provider is chosen by `SPORTS_API_PROVIDER` (`mock` | `the-odds-api` |
`api-football`; key in `SPORTS_API_KEY`) and bound in
[`sports.module.ts`](../apps/api/src/integrations/sports/sports.module.ts). The
shared HTTP client
([`apps/api/src/integrations/sports/http.ts`](../apps/api/src/integrations/sports/http.ts))
already retries 429/5xx with exponential backoff and honours `Retry-After`.
Fixture ingestion runs on the worker every `INGEST_INTERVAL_MS` (default 15m)
for the sports listed in `INGEST_SPORTS`.

**Diagnose**

1. Worker/API logs — repeated 429 (quota exhausted) or 5xx/timeout from the
   vendor's base URL confirms the outage and which call is failing.
2. Vendor status page / dashboard — check quota and incident status.
3. Confirm `SPORTS_API_KEY` is present and not expired/over-quota.

**Mitigate**

- **Vendor down or rate-limited:** set `SPORTS_API_PROVIDER=mock` and redeploy to
  stop erroring calls; the keyless mock keeps the pipeline running so already-known
  results still settle. Switch back once the vendor recovers.
- **Quota exhausted:** raise the quota with the vendor, or widen
  `INGEST_INTERVAL_MS` / trim `INGEST_SPORTS` to cut call volume until reset.
- **Manual catch-up:** after recovery, trigger an ad-hoc pull with
  `POST /api/events/ingest` (`{"sport":"…"}`, requires the `data:ingest`
  permission) instead of waiting for the next scheduled cycle.

**Verify:** ingest logs show fixtures/odds returning, settlement cycles succeed,
and any settlement alert clears.

---

## Runbook: payout failure

**Symptom:** tipster transfers aren't completing — payouts stuck `pending` or
flipping to `failed`.

Balances derive from the funds ledger (`Payment` rows, one per verified webhook).
Payouts run via `PayoutsService`
([`apps/api/src/modules/payouts/payouts.service.ts`](../apps/api/src/modules/payouts/payouts.service.ts)):

- `POST /api/payouts/run` — admin weekly batch (optional ISO-week `period`, e.g.
  `2026-W29`); balance-based and idempotent per (tipster, week).
- `POST /api/payouts/request` — a tipster asks off-schedule; created
  `awaiting_approval`.
- `POST /api/admin/payouts/:id/approve` — admin approves → transfers (`finance:manage`).

`settleTransfer` calls the payment provider with an **idempotency key**
(`{tipsterId}:{week}` or `{tipsterId}:{payoutId}`), so a retry never double-pays.
Status flow: `awaiting_approval → pending → paid`, or `→ failed` on a transfer
error, or `rejected`. A payout with **no destination yet** stays `pending`
(nothing moves) until the tipster adds a payout method.

**Diagnose**

1. Find the stuck rows:
   ```sql
   SELECT id, tipster_id, period, status, amount_cents, stripe_transfer_id
   FROM "Payout" WHERE status IN ('pending','failed') ORDER BY "createdAt" DESC;
   ```
2. API logs — `Payout transfer failed for <userId>` carries the provider error
   (common: destination account not connected/enabled, insufficient platform
   balance, or bad Stripe credentials).
3. `pending` with no `stripe_transfer_id` and no destination → the tipster hasn't
   connected a payout method; this is expected, not an incident.

**Mitigate**

- **Provider credential/config error:** fix `PAYMENTS_PROVIDER` /
  `STRIPE_SECRET_KEY`, redeploy, then re-run: `POST /api/payouts/run` for the
  batch, or re-approve the specific request. The idempotency key makes re-runs
  safe — a transfer that already succeeded won't repeat.
- **Destination not connected/enabled:** ask the tipster to finish payout
  onboarding; the `pending` payout settles on the next run once a valid
  destination exists.
- **Insufficient platform balance:** top up the payment provider balance, then
  re-run.
- **Suspected double transfer / wrong amount:** treat as **P0** — pause further
  payout runs, reconcile against the provider dashboard, and page the ops lead.
  Never edit `Payout`/`Payment` rows by hand to "fix" money; correct through a
  provider refund/transfer and let the ledger reflect it.

**Verify:** the affected payouts show `paid` with a `stripe_transfer_id`, and the
provider dashboard shows matching transfers.

---

## Doc-review checklist (acceptance criteria)

- [x] Runbooks published for the four common incidents — settlement stuck,
      webhook backlog, vendor outage, payout failure (above).
- [x] Escalation path defined — severity → channel routing and the on-call ladder
      (see [Escalation path](#escalation-path)).
- [x] Alerts link here — every rule in
      [`infra/monitoring/alerts.yml`](../infra/monitoring/alerts.yml) sets
      `runbook_url` to this document.
- [x] Cross-linked from [OBSERVABILITY.md](./OBSERVABILITY.md) and
      [DR-RUNBOOK.md](./DR-RUNBOOK.md).
