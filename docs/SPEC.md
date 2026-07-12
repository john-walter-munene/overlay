# Verified Tipster Marketplace — MVP Spec & Path to Production

> **Working name:** ProofPicks (placeholder)
> **Status:** Draft v1
> **Last updated:** 2026-07-12

---

## 1. Vision

A tipping marketplace where **picks are cryptographically locked before the event starts**, making tipster track records tamper-proof. Bettors subscribe to tipsters ranked by *verified* ROI and Closing Line Value (CLV) — not cherry-picked screenshots. The platform takes a cut of subscription revenue.

The entire moat is **trust**. Every design decision serves one principle:

> **You cannot fake, edit, or delete a losing pick.**

We sell **data, tools, and picks** — we do **not** take bets. This deliberately sidesteps most gambling licensing in v1.

---

## 2. The problem

| Party | Pain today | Our fix |
|---|---|---|
| Bettor | Can't tell real tipsters from scammers | Verified, immutable track records |
| Honest tipster | Can't prove skill vs. cheaters | Portable, provable reputation |
| Platform (us) | — | 20–30% take of subscription revenue |

---

## 3. MVP scope

### 3.1 Must-have (ships in v1)
1. **Pick submission with lock** — tipster posts a pick (event, market, selection, odds, stake units) before a cutoff (event start). Server timestamps + hashes it. Immutable after lock.
2. **Automated settlement** — pull results from a sports data API; auto-grade picks won/lost/void. No manual editing by tipster.
3. **Verified stats engine** — per tipster: ROI, yield, win rate, CLV, sample size, max drawdown, current streak. Computed only from settled picks.
4. **Tipster leaderboard** — ranked by yield/CLV with a minimum sample-size filter (e.g. 50+ picks).
5. **Subscriptions** — users pay monthly to see a tipster's live picks; platform takes a cut and pays out tipster.
6. **Pick delivery** — subscribers see picks in-app + email/push the moment they post.

### 3.2 Out of scope for MVP
- No bet placement / no wagering (keeps us out of gambling licensing).
- No in-app wallet / crypto (v1 is fiat via Stripe).
- No social feed, comments, or DMs.
- No native mobile app (responsive web first).

---

## 4. Trust mechanism (the actual product)

- **Lock = hash + timestamp.** On submission, store `SHA256(pick_payload + nonce)` with a trusted server timestamp. Reveal the pick to subscribers immediately; the hash proves it wasn't altered.
- **CLV as the anti-luck metric.** Record odds at pick time *and* closing odds. Consistently beating the closing line proves genuine skill, even on small samples. This is the core differentiator vs. every "win rate" scam site.
- **No deletes, no edits.** Once locked, a pick is permanent. Void only via objective result API (postponed match, etc.).
- **Public verifiability (stretch).** Optionally anchor daily pick-hash roots to a public chain / OpenTimestamps so even *we* can't be accused of editing.

---

## 5. Data model (core)

```
users            (id, role[user|tipster|admin], email, created_at)
tipsters         (user_id, bio, sports[], subscription_price, payout_account)
picks            (id, tipster_id, event_id, market, selection,
                  odds_at_pick, stake_units, hash, nonce, locked_at,
                  status[pending|won|lost|void], closing_odds,
                  settled_at, result, clv)
subscriptions    (id, user_id, tipster_id, status, current_period_end)
tipster_stats    (tipster_id, roi, yield, clv_avg, win_rate,
                  sample_size, max_drawdown, current_streak, updated_at)  -- materialized
payouts          (id, tipster_id, amount, period, status)
```

---

## 6. Key flows

### 6.1 Tipster posts a pick
1. Selects event (from data API) + market + selection + odds + stake units.
2. System validates event hasn't started → locks (hash + timestamp).
3. Pick fans out to subscribers instantly.

### 6.2 Settlement (event-driven / cron)
1. Poll results API for finished events.
2. Grade each pending pick; fetch closing odds → compute CLV.
3. Recompute `tipster_stats`.

### 6.3 Subscription
1. User subscribes (Stripe) → gains access to tipster's live picks.
2. Monthly: platform pays tipster their share minus fee.

---

## 7. Tech stack (opinionated, ship-fast)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js + Tailwind | Responsive web |
| Backend | Node/TypeScript (NestJS or Fastify) | Or Python/FastAPI |
| Database | PostgreSQL | Redis for fan-out/queues |
| Jobs | BullMQ (or Celery) + cron | Settlement engine |
| Payments | Stripe + Stripe Connect | Tipster payouts |
| Sports data | The Odds API / SportMonks / API-Football | **Critical: must provide closing odds for CLV** |
| Auth | Clerk / Auth0 / Supabase Auth | |
| Notifications | Resend/Postmark (email) + web push | |
| Hosting | Vercel (web) + Railway/Fly/AWS (API+DB) | |
| Observability | Sentry + structured logs + uptime monitor | |

---

## 8. Monetization

- **Platform fee:** 20–30% of each subscription (Patreon model).
- **Tiered listing:** free tier + boosted placement for verified tipsters.
- **Affiliate layer (later):** "place this pick at Book X" → sportsbook referral revenue on top of subscriptions.

---

## 9. Risks & mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Data quality (settlement / closing odds) | Trust collapses | Pick vendor carefully; cross-check with a second source |
| Cold start (no tipsters/subscribers) | No marketplace | Free public leaderboard where tipsters build verified records before charging |
| Regulation (paid tips) | Legal exposure | Take no bets; verify per-jurisdiction rules for paid tipping |
| Payment processor risk | Revenue cut off | Stay strictly "tools/data/picks"; clear ToS; avoid gambling MCC triggers |

---

## 10. MVP success metrics

- # tipsters with 50+ verified picks
- Subscriber conversion rate on the leaderboard
- Avg CLV of top-decile tipsters (proves the metric works)
- MRR + platform take
- Settlement accuracy (% picks auto-graded correctly)

---

## 11. Path to production

### Phase 0 — Foundations (Week 1–2)
- Repo, CI/CD, environments (dev/staging/prod), IaC basics.
- Auth + user/role model.
- Sports data vendor selected + spike: fixtures, odds, **closing odds**, results.
- **Exit criteria:** can authenticate; can fetch an event with pre-match and closing odds end-to-end.

### Phase 1 — Pick engine (Week 3–5)
- Pick submission + lock (hash + timestamp + immutability guarantees).
- Settlement worker (grade won/lost/void from results API).
- CLV computation.
- **Exit criteria:** a pick can be posted, locked, auto-settled, and CLV computed with no manual intervention.

### Phase 2 — Stats & leaderboard (Week 5–7)
- `tipster_stats` materialization (ROI, yield, CLV, drawdown, streak).
- Leaderboard with min-sample filter + tipster profile pages.
- **Exit criteria:** leaderboard reflects only verified settled picks and updates within N minutes of settlement.

### Phase 3 — Monetization (Week 7–9)
- Stripe subscriptions + gated pick access.
- Stripe Connect payouts + platform fee.
- Notifications (email + push) on new picks.
- **Exit criteria:** a user can subscribe, receive live picks, and a tipster gets paid out.

### Phase 4 — Hardening & launch (Week 9–12)
- Security review (hash integrity, access control, webhook signature verification).
- Load test settlement on a busy fixture day.
- Observability, alerting, backups, runbooks.
- Legal: ToS, privacy policy, jurisdiction check, "no wagering" disclaimers.
- Closed beta → seed tipsters on free public leaderboard → public launch.
- **Exit criteria:** SLOs met, on-call runbook exists, legal sign-off, beta feedback incorporated.

### Cross-cutting (all phases)
- Automated tests (unit for stats math, integration for settlement).
- Feature flags for risky rollouts.
- Structured logging + audit trail on every pick lock/settle.

---

## 12. Open questions

1. Which sports data vendor gives reliable **closing odds** at acceptable cost?
2. Single-source vs. dual-source settlement for trust?
3. Which sports to launch with? (Soft, high-liquidity markets favor CLV signal.)
4. Public-chain anchoring in v1, or defer to v2?
5. Target launch jurisdictions and their rules on paid tipping.

---
