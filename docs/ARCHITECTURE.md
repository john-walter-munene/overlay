# Overlay Bets — System Architecture

> **Status:** Live — walking skeleton implemented end-to-end; hardening for production (see `PROD-READINESS-BACKLOG.md`).
> **Scope:** Verified tipster marketplace + free daily-tips hub. No bet placement, no wagering. Global reach via multi-currency pricing and card / crypto-stablecoin / mobile-money rails.
> **Companion docs:** `SPEC.md` (product), `ROADMAP.md` (delivery), `PROD-READINESS-BACKLOG.md` (issue-ready backlog), `VENDOR-SPIKE.md` (data vendor), `PRIVACY.md` (GDPR/retention), `OBSERVABILITY.md` (metrics/alerts).

---

## 0. Implementation status (snapshot)

| Area | Status |
|---|---|
| Auth (Supabase Auth, JWKS-verified) | **Built** |
| Pick submit + hash-lock + audit log | **Built** |
| Settlement worker (closing odds → grade → CLV → stats) | **Built** |
| Stats engine + leaderboard + tipster profiles | **Built** |
| Subscriptions + entitlement gating | **Built** (Stripe live; crypto/mobile-money hosted-checkout) |
| Payouts + platform fee accounting | **Built** (transfers being hardened) |
| Notifications (Resend email + preferences/digests) | **Built**; web push pending |
| Free "Daily Tips" hub | **Built** |
| Articles/blog + SEO | **Built** |
| Admin API + moderation | **Built** (admin UI in progress) |
| Privacy/GDPR export + erasure | **Built** |
| Multi-currency (FX conversion) | **Built** |
| Observability (Prometheus metrics, health) | **Built**; Sentry pending |
| DB-level pick immutability trigger | **Built** (app-layer guard + Postgres trigger — OB-035) |

> The backlog (`PROD-READINESS-BACKLOG.md`) tracks the remaining production-hardening work with stable `OB-###` IDs.

---

## 1. Architectural goals & principles

| Goal | Why | Implication |
|---|---|---|
| **Integrity of picks** | The moat: picks can't be faked/edited | Hash-lock + timestamp + append-only pick store + audit log |
| **Accurate, automated settlement** | Trust dies with bad grading | Idempotent settlement worker, dual-source option, void handling |
| **Correct stats math** | CLV/ROI must be provably right | Deterministic, unit-tested stats engine; recompute from source of truth |
| **Clear compliance boundary** | Avoid gambling licensing | No bet placement; we store picks + data only |
| **Ship fast, scale later** | MVP timeline ~12 weeks | Modular monolith over microservices; managed services |

**Guiding principle:** the **`picks` table is append-only**. A pick, once locked, is never mutated except by the settlement worker writing objective results. This is enforced at the DB and application layers.

---

## 2. High-level system diagram

```
                         ┌─────────────────────────────────────────────┐
                         │                  Clients                     │
                         │   Web (Next.js)   ·   Email   ·   Web Push    │
                         └───────────────┬─────────────────────────────┘
                                         │ HTTPS / JSON
                                         ▼
                         ┌─────────────────────────────────────────────┐
                         │              API (modular monolith)          │
                         │  Auth · Picks · Tipsters · Stats · Subs ·    │
                         │  Notifications · Admin                       │
                         └───┬───────────┬───────────┬─────────────┬────┘
                             │           │           │             │
              ┌──────────────┘   ┌───────┘     ┌─────┘        ┌────┘
              ▼                  ▼             ▼              ▼
      ┌──────────────┐   ┌──────────────┐ ┌─────────┐  ┌──────────────┐
      │ PostgreSQL   │   │    Redis     │ │  Queue  │  │  External    │
      │ (source of   │   │ cache /      │ │ (BullMQ)│  │  services    │
      │  truth)      │   │ pub-sub      │ │         │  │              │
      └──────────────┘   └──────────────┘ └────┬────┘  └──────────────┘
                                               │        Stripe · Sports Data API
                                               ▼        Email (Resend) · Push
                                        ┌──────────────┐
                                        │   Workers    │
                                        │ settlement · │
                                        │ CLV · stats· │
                                        │ notify·payout│
                                        └──────────────┘
```

---

## 3. Component breakdown

### 3.1 Web app (Next.js)
- SSR/ISR for public pages (leaderboard, tipster profiles) → SEO.
- Client app for authenticated dashboards (post picks, view subscriptions).
- Talks only to the API (no direct DB access).

### 3.2 API (modular monolith, TypeScript)
Single deployable, internally split into modules with clear boundaries:

| Module | Responsibility |
|---|---|
| **auth** | Signup/login, sessions/JWT, roles (user/tipster/admin) |
| **tipsters** | Profiles, pricing, onboarding |
| **picks** | Submit + lock (hash/timestamp), read/fan-out; append-only |
| **stats** | Serve materialized tipster stats; leaderboard queries |
| **subscriptions** | Provider-agnostic checkout (Stripe / crypto / mobile-money), entitlement checks, gating |
| **payouts** | Payout transfers + platform fee accounting; per-tipster payout destination |
| **notifications** | Email dispatch (Resend) + per-user preferences/digests; web push planned |
| **articles** | SEO content (blog/strategy guides): public read + admin authoring |
| **free-tips** | Free "Daily Tips" hub: per-date public tips (cold-start / SEO) |
| **admin** | Moderation, tipster suspension, role management, audit-log, dashboard metrics |
| **events** | Fixture ingestion from sports-data vendors |
| **users** | Account profile, username, settings |
| **privacy** | GDPR data-subject export + erasure (PII anonymised, pick integrity preserved) |
| **health** | Liveness/readiness probes for the host/orchestrator |
| **metrics** | Prometheus metrics endpoint (settlement latency, queue depth, errors) |

**Cross-cutting integrations** (under `integrations/`): `payments` (Stripe / Coinbase Commerce / Flutterwave / mock, behind a provider registry), `sports` (The Odds API / API-Football / mock adapters + mappers), `fx` (currency conversion), `storage` (Supabase Storage for avatars/article images).

> Modular monolith (not microservices) for MVP: simpler ops, easy transactions, refactor to services later along module seams if needed.

### 3.3 Workers (background jobs)
Separate process, same codebase, driven by **BullMQ** (Redis-backed). On constrained hosting (e.g. Render free tier) the settlement loop can run **embedded** in the API in interval mode (`EMBED_WORKER=true`, `WORKER_MODE=interval`) instead of a dedicated worker + Redis — flip to the standalone worker on a paid plan (OB-143):

| Job | Trigger | Function |
|---|---|---|
| `ingest-events` | cron | Pull fixtures/odds from data vendor |
| `capture-closing-odds` | scheduled per event kickoff | Snapshot closing line for CLV |
| `settle-picks` | cron / event finish | Grade won/lost/void from results feed (idempotent) |
| `compute-clv` | after closing-odds + settle | Compute CLV per pick |
| `recompute-stats` | after settlement batch | Materialize `tipster_stats` |
| `dispatch-notifications` | on new pick / settlement | Email + push fan-out |
| `run-payouts` | scheduled (monthly) | Provider payout transfers (Stripe Connect / crypto / mobile-money) |

### 3.4 Data stores
- **PostgreSQL** — single source of truth. Append-only `picks`; materialized `tipster_stats`.
- **Redis** — cache (leaderboard, hot profiles), pub/sub for live pick fan-out, BullMQ backend.

### 3.5 External services
- **Sports Data API** — fixtures, odds, **closing odds**, results via **The Odds API** / **API-Football** adapters (see `VENDOR-SPIKE.md`).
- **Stripe** (+ Connect) — card subscriptions + tipster payouts.
- **Coinbase Commerce** — crypto stablecoin (USDC/USDT) hosted checkout, pay-per-period.
- **Flutterwave** — mobile money for African markets (M-Pesa, MTN MoMo, Airtel Money), pay-per-period.
- **Supabase** — Auth (JWT via JWKS) + Storage (avatars, article images).
- **Resend** — transactional email.
- **Web Push (VAPID)** — browser notifications (planned).

> Payment providers sit behind a common `PaymentProvider` interface + registry, so subscriptions/payouts are provider-agnostic. Prices are stored in USD minor units and converted to the subscriber's local currency by the FX layer at checkout.

---

## 4. Core data model (v1)

```
users(id, role, email, supabase_user_id, username, created_at)
    -- password_hash retained but legacy; auth is Supabase (JWKS)

tipsters(user_id PK/FK, bio, sports[], subscription_price_cents,
         stripe_account_id, payout_destination, status, created_at)

events(id PK, vendor_event_id, sport, league, home, away,
       start_time, status, closing_captured_at)

picks(id PK, tipster_id FK, event_id FK,
      market, selection, odds_at_pick, stake_units,
      hash, nonce, locked_at,                 -- integrity fields
      status[pending|won|lost|void],
      closing_odds, clv, result, settled_at)  -- settlement fields (worker-only writes)

subscriptions(id PK, user_id FK, tipster_id FK,
              stripe_subscription_id, status, current_period_end)

tipster_stats(tipster_id PK/FK, roi, yield, clv_avg, win_rate,
              sample_size, max_drawdown, current_streak, updated_at)  -- materialized

payouts(id PK, tipster_id FK, amount_cents, period, status, stripe_transfer_id)

payments(id PK, user_id, tipster_id, provider, reference UNIQUE,
         amount_cents, currency, period, created_at)  -- funds ledger; payouts computed from collected revenue

notification_preferences(user_id PK/FK, channel, frequency, updated_at)

free_tips(id PK, sport, event, market, selection, tip_date, published_at)  -- free Daily Tips hub

audit_log(id PK, actor, action, entity, entity_id, payload_json, created_at)
```

**Integrity rules**
- `picks`: application forbids UPDATE of core fields post-lock; only the settlement worker writes settlement fields. A `BEFORE UPDATE` trigger (`pick_enforce_immutability`, OB-035) enforces this at the DB layer — core wager/integrity fields (market/selection/odds/hash/nonce/lockedAt…) can never change, and settlement fields may only progress the pick forward (closing-line capture while pending → the `pending → terminal` grade → a one-time CLV write), so a settled pick can't be re-graded, un-settled, or back-dated. Every write is mirrored to `audit_log`.
- `hash = SHA256(canonical(pick_payload) + nonce)`; `locked_at` from trusted server clock.

---

## 5. Key sequence flows

### 5.1 Post a pick (with lock)
```
Tipster → Web → API(picks): submit(event, market, selection, odds, stake)
  API: assert event.start_time > now()      (reject late picks)
  API: nonce = random(); hash = SHA256(canonical(payload)+nonce)
  API: INSERT picks(... status=pending, hash, locked_at=now())
  API: write audit_log
  API → Redis pub/sub: "new_pick" → fan-out to subscribers
  API → queue: dispatch-notifications(pick_id)
  API → Web: 201 locked pick
```

### 5.2 Settlement + CLV
```
cron → worker(settle-picks):
  for each finished event:
    result = resultsAPI.get(event)
    for each pending pick on event:
      grade = evaluate(pick.selection, result)   -- won|lost|void
      UPDATE picks SET status=grade, result, settled_at  (idempotent)
worker(capture-closing-odds): snapshot closing line at kickoff
worker(compute-clv): clv = f(odds_at_pick, closing_odds)
worker(recompute-stats): materialize tipster_stats
  → invalidate Redis leaderboard cache
```

### 5.3 Subscribe + gated picks
```
User → Web → API(subscriptions): checkout(tipster)
  API → Stripe Checkout → webhook: subscription.active
  API: INSERT subscription(entitlement)
Later: User → API(picks): list(tipster)
  API: assert active subscription  → return live picks   (else 402/preview)
```

### 5.4 Payouts
```
monthly cron → worker(run-payouts):
  per tipster: gross = Σ active subs; fee = gross * platform_rate
  net = gross - fee → Stripe Connect transfer → INSERT payouts
```

---

## 6. Tech stack (locked for v1)

| Layer | Choice | Rationale |
|---|---|---|
| Web | **Next.js + Tailwind** | SSR for SEO, one language across stack |
| API | **NestJS (TypeScript)** | Module boundaries fit modular-monolith design |
| ORM/DB | **Prisma + PostgreSQL** | Type-safe, migrations, good DX |
| Cache/Queue | **Redis + BullMQ** | Pub/sub fan-out + reliable jobs |
| Auth | **Supabase Auth** | Free (~50k MAU), Postgres-native; API verifies JWTs via JWKS (OB-145) |
| Payments | **Stripe + Connect** (cards) · **Coinbase Commerce** (crypto) · **Flutterwave** (mobile money) | Provider-agnostic registry; global reach |
| FX | **In-house FX layer** | Store USD minor units; convert to local currency at checkout |
| Email | **Resend** | Simple transactional email |
| Storage | **Supabase Storage** | Avatars, article cover images |
| Hosting | **Vercel** (web) · **Render** (API + worker + Postgres + Redis via `render.yaml`) | Managed, fast to prod |
| Observability | **Prometheus/Grafana** + structured logs + health probes; Sentry planned | Error + perf visibility (see `OBSERVABILITY.md`) |
| CI/CD | **GitHub Actions** | Lint, test, migrate, deploy |

> **Decision:** NestJS over Fastify-bare — its module system enforces the boundaries this architecture depends on. Revisit only if startup complexity becomes a problem.

---

## 7. Repository topology (target for scaffolding)

```
overlay/
├── apps/
│   ├── web/                 # Next.js (self-contained; NEXT_PUBLIC_* envs)
│   └── api/                 # NestJS — modules/, integrations/, workers/ (HTTP + worker entrypoints)
├── packages/
│   └── shared/              # types, DTOs, stats math (CLV/ROI), FX, daily-tips — unit-tested
├── prisma/                  # schema + migrations
├── infra/                   # docker-compose (local pg+redis), monitoring (Prometheus/Grafana/Alertmanager)
├── docs/                    # SPEC, ROADMAP, ARCHITECTURE, PROD-READINESS-BACKLOG, VENDOR-SPIKE, PRIVACY, OBSERVABILITY, NAMING
├── render.yaml              # Render blueprint (API + worker + Postgres + Redis)
└── package.json             # npm workspace root (pnpm blocked in this env)
```

The **stats math lives in `packages/shared`** so it's independently unit-testable and reused by API + workers — correctness here is non-negotiable.

---

## 8. Security & integrity

- **Pick immutability:** app-layer guard + DB trigger (`pick_enforce_immutability`, OB-035); all mutations → `audit_log`.
- **Webhook verification:** Stripe + data-vendor signatures validated; reject unsigned.
- **AuthZ:** role checks (tipster can post; only settlement worker writes results); subscription entitlement gate on pick reads.
- **Secrets:** env-managed, never in repo; rotate keys.
- **Rate limiting:** on pick submission and auth endpoints.
- **Stretch — public verifiability:** daily Merkle root of pick hashes anchored via OpenTimestamps/public chain so even the platform can't backdate.

---

## 9. Scaling path (post-MVP, informational)

1. Extract workers to autoscaled pool (already separate process).
2. Read replicas for leaderboard/profile reads.
3. Split high-traffic modules (picks, stats) into services along module seams.
4. Move live fan-out to a dedicated realtime service (WebSocket gateway).
5. Introduce event bus (e.g. NATS/Kafka) if settlement volume demands it.

---

## 10. Open architectural decisions

1. **Auth:** ✅ Decided — **Supabase Auth** (OB-145). Identity lives in Supabase; roles + domain data (Tipster, Subscriptions, Picks) in Postgres, linked by `supabaseUserId`. The API verifies Supabase access tokens via JWKS and provisions the local `User` on first request.
2. **Payments:** ✅ Decided — multi-rail behind a provider registry: **Stripe** (cards + Connect), **Coinbase Commerce** (crypto stablecoin), **Flutterwave** (mobile money). Crypto/mobile-money are pay-per-period (no card-on-file).
3. **Global pricing:** ✅ Decided — store prices in USD minor units; convert to local currency at checkout via the FX layer.
4. **Hosting:** ✅ Decided — **Render** (API + worker + Postgres + Redis via `render.yaml`) + **Vercel** (web).
5. **Data vendor + closing-odds source** (book close vs Betfair exchange price). → `VENDOR-SPIKE.md`. Adapters exist for The Odds API + API-Football; production key + validation pending (OB-045).
6. **Single vs dual-source settlement** for trust vs cost (OB-047, stretch).
7. **DB-level pick immutability trigger** — ✅ Decided & built (OB-035): app-layer guard backed by the `pick_enforce_immutability` `BEFORE UPDATE` trigger.
8. **Public-chain anchoring** — deferred to post-MVP (OB-037, stretch).
```
