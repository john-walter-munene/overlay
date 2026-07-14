# Overlay Bets — System Architecture (v1)

> **Status:** Draft v1
> **Scope:** MVP architecture for the verified tipster marketplace. Fiat-only, no wagering, no crypto.
> **Companion docs:** `SPEC.md` (product), `ROADMAP.md` (delivery), `VENDOR-SPIKE.md` (data vendor), `PRIVACY.md` (GDPR/retention).

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
| **subscriptions** | Stripe checkout, entitlement checks, gating |
| **payouts** | Stripe Connect transfers, platform fee accounting |
| **notifications** | Email + web push dispatch |
| **articles** | SEO content (blog/strategy guides): public read + admin authoring |
| **admin** | Moderation, tipster suspension, role management, audit-log, dashboard metrics |
| **events** | Fixture ingestion from sports-data vendors |

> Modular monolith (not microservices) for MVP: simpler ops, easy transactions, refactor to services later along module seams if needed.

### 3.3 Workers (background jobs)
Separate process, same codebase, driven by **BullMQ** (Redis-backed):

| Job | Trigger | Function |
|---|---|---|
| `ingest-events` | cron | Pull fixtures/odds from data vendor |
| `capture-closing-odds` | scheduled per event kickoff | Snapshot closing line for CLV |
| `settle-picks` | cron / event finish | Grade won/lost/void from results feed (idempotent) |
| `compute-clv` | after closing-odds + settle | Compute CLV per pick |
| `recompute-stats` | after settlement batch | Materialize `tipster_stats` |
| `dispatch-notifications` | on new pick / settlement | Email + push fan-out |
| `run-payouts` | scheduled (monthly) | Stripe Connect transfers |

### 3.4 Data stores
- **PostgreSQL** — single source of truth. Append-only `picks`; materialized `tipster_stats`.
- **Redis** — cache (leaderboard, hot profiles), pub/sub for live pick fan-out, BullMQ backend.

### 3.5 External services
- **Sports Data API** — fixtures, odds, **closing odds**, results (see `VENDOR-SPIKE.md`).
- **Stripe** (+ Connect) — subscriptions + tipster payouts.
- **Resend/Postmark** — transactional email.
- **Web Push (VAPID)** — browser notifications.

---

## 4. Core data model (v1)

```
users(id, role, email, password_hash, created_at)

tipsters(user_id PK/FK, bio, sports[], subscription_price_cents,
         stripe_account_id, status, created_at)

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

audit_log(id PK, actor, action, entity, entity_id, payload_json, created_at)
```

**Integrity rules**
- `picks`: application forbids UPDATE of core fields post-lock; only the settlement worker writes settlement fields. DB triggers/row-level checks enforce immutability; every write mirrored to `audit_log`.
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
| Payments | **Stripe + Connect** | Subscriptions + marketplace payouts |
| Email | **Resend** | Simple transactional email |
| Hosting | **Vercel** (web) · **Fly.io/Railway** (API+workers+DB) | Managed, fast to prod |
| Observability | **Sentry** + structured logs + uptime monitor | Error + perf visibility |
| CI/CD | **GitHub Actions** | Lint, test, migrate, deploy |

> **Decision:** NestJS over Fastify-bare — its module system enforces the boundaries this architecture depends on. Revisit only if startup complexity becomes a problem.

---

## 7. Repository topology (target for scaffolding)

```
overlay-bets/
├── apps/
│   ├── web/                 # Next.js
│   └── api/                 # NestJS (HTTP + worker entrypoints)
├── packages/
│   ├── shared/              # types, DTOs, stats math (CLV/ROI) — unit-tested
│   └── config/              # shared tsconfig/eslint
├── prisma/                  # schema + migrations
├── infra/                   # IaC, docker-compose (local pg+redis)
├── docs/                    # SPEC, ROADMAP, ARCHITECTURE, VENDOR-SPIKE, NAMING
└── package.json           # npm workspace root (pnpm blocked in this env)
```

The **stats math lives in `packages/shared`** so it's independently unit-testable and reused by API + workers — correctness here is non-negotiable.

---

## 8. Security & integrity

- **Pick immutability:** app-layer guard + DB constraint/trigger; all mutations → `audit_log`.
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
2. **Data vendor + closing-odds source** (book close vs Betfair exchange price). → `VENDOR-SPIKE.md`.
3. **Single vs dual-source settlement** for trust vs cost.
4. **Public-chain anchoring in v1** or defer to v2.
5. **Hosting:** Fly.io vs Railway vs AWS ECS for API+workers.
```
