# Overlay Bets — Roadmap to Production

> Phased delivery plan. Each phase has explicit **exit criteria** — don't advance until they're met.
>
> **Where we are (2026-07):** Phases 0–3 are **functionally built** end-to-end (walking skeleton); Phase 4 (hardening) is **in progress**. Detailed, issue-ready remaining work lives in `PROD-READINESS-BACKLOG.md` (`OB-###`).

---

## Status at a glance

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundations (repo, auth, vendor spike) | ✅ Built (auth on Supabase; live vendor key pending — OB-045) |
| 1 | Pick engine (lock, settlement, CLV) | ✅ Built (DB immutability trigger shipped — OB-035) |
| 2 | Stats & leaderboard | ✅ Built |
| 3 | Monetization (subs, payouts, notifications) | ✅ Built (Stripe live; crypto/mobile-money added; web push pending) |
| 3.5 | Global reach (multi-currency, free Daily Tips, GDPR) | ✅ Built (added post-v1) |
| 4 | Hardening & launch | 🟡 In progress — see `PROD-READINESS-BACKLOG.md` |

---

## Dependency chain

```
p0-vendor-spike ─▶ p0-foundations ─▶ p1-pick-engine ─▶ p2-stats-leaderboard ─▶ p3-monetization ─▶ p4-hardening-launch
```

---

## Phase 0 — Foundations

**Status:** ✅ Built. Auth runs on **Supabase Auth** (JWKS-verified). Sports adapters built for The Odds API + API-Football; live production key + end-to-end validation still pending (OB-045).

**Work**
- Repo, CI/CD, dev/staging/prod environments, IaC basics.
- Auth + user/role model (user | tipster | admin).
- **Sports-data vendor spike** (see `VENDOR-SPIKE.md`) — select vendor; validate fixtures, odds, **closing odds**, results.

**Exit criteria**
- Can authenticate.
- Can fetch an event with pre-match **and** closing odds end-to-end.

---

## Phase 1 — Pick engine

**Status:** ✅ Built. Pick lock, settlement worker, and CLV all run automatically. Immutability is enforced both app-side and at the DB layer via the `pick_enforce_immutability` trigger (OB-035).

**Work**
- Pick submission + lock: `SHA256(pick_payload + nonce)` + trusted timestamp + immutability guarantees.
- Settlement worker: grade won / lost / void from results API.
- CLV computation: odds-at-pick vs. closing odds.

**Exit criteria**
- A pick can be posted, locked, auto-settled, and CLV computed with **no manual intervention**.

---

## Phase 2 — Stats & leaderboard

**Status:** ✅ Built. Leaderboard caching/incremental invalidation is a hardening item (OB-055).

**Work**
- Materialize `tipster_stats`: ROI, yield, CLV, win rate, max drawdown, current streak.
- Leaderboard with minimum sample-size filter (e.g. 50+ picks).
- Tipster profile pages.

**Exit criteria**
- Leaderboard reflects **only** verified settled picks and updates within minutes of settlement.

---

## Phase 3 — Monetization

**Status:** ✅ Built. Stripe subscriptions + entitlement gating + payouts + email notifications work. Added post-v1: **crypto stablecoin** (Coinbase Commerce) and **mobile money** (Flutterwave) rails, plus notification preferences/digests. Web push is still pending (OB-031).

**Work**
- Stripe subscriptions + gated pick access.
- Stripe Connect payouts + platform fee (20–30%).
- Notifications (email + web push) on new picks.

**Exit criteria**
- A user can subscribe, receive live picks, and a tipster gets paid out.

---

## Phase 3.5 — Global reach & growth (added post-v1)

**Status:** ✅ Built.

**Work**
- Multi-currency pricing: store USD minor units, convert to the subscriber's local currency via the FX layer.
- Free **Daily Tips** hub (per-date public tips) for cold-start / SEO.
- GDPR data-subject export + erasure (PII anonymised, pick integrity preserved).
- Account/username, notification preferences, Supabase Storage for avatars/article images.

---

## Phase 4 — Hardening & launch

**Status:** 🟡 In progress. The full, issue-ready checklist lives in `PROD-READINESS-BACKLOG.md` (`OB-###`) — highlights: live sports vendor (OB-045), Stripe webhook/Connect completion (OB-060/040), web push (OB-031), Sentry (OB-090), integration/e2e tests (OB-110–112), deploy hardening (OB-100–105).

**Work**
- Security review: hash integrity, access control, webhook signature verification.
- Load test settlement on a busy fixture day.
- Observability, alerting, backups, runbooks.
- Legal: ToS, privacy policy, jurisdiction check, "no wagering" disclaimers.
- Closed beta → seed tipsters on free public leaderboard → public launch.

**Exit criteria**
- SLOs met, on-call runbook exists, legal sign-off, beta feedback incorporated.

---

## Cross-cutting (all phases)

- Automated tests: unit for stats math, integration for settlement.
- Feature flags for risky rollouts.
- Structured logging + audit trail on every pick lock/settle.

---

## MVP success metrics

- # tipsters with 50+ verified picks
- Subscriber conversion rate on the leaderboard
- Avg CLV of top-decile tipsters (proves the metric works)
- MRR + platform take
- Settlement accuracy (% picks auto-graded correctly)
