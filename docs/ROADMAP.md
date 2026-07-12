# Overlay Bets — Roadmap to Production

> Phased delivery plan. Each phase has explicit **exit criteria** — don't advance until they're met.
> Estimated timeline: ~12 weeks with a small team.

---

## Dependency chain

```
p0-vendor-spike ─▶ p0-foundations ─▶ p1-pick-engine ─▶ p2-stats-leaderboard ─▶ p3-monetization ─▶ p4-hardening-launch
```

---

## Phase 0 — Foundations (Week 1–2)

**Work**
- Repo, CI/CD, dev/staging/prod environments, IaC basics.
- Auth + user/role model (user | tipster | admin).
- **Sports-data vendor spike** (see `VENDOR-SPIKE.md`) — select vendor; validate fixtures, odds, **closing odds**, results.

**Exit criteria**
- Can authenticate.
- Can fetch an event with pre-match **and** closing odds end-to-end.

---

## Phase 1 — Pick engine (Week 3–5)

**Work**
- Pick submission + lock: `SHA256(pick_payload + nonce)` + trusted timestamp + immutability guarantees.
- Settlement worker: grade won / lost / void from results API.
- CLV computation: odds-at-pick vs. closing odds.

**Exit criteria**
- A pick can be posted, locked, auto-settled, and CLV computed with **no manual intervention**.

---

## Phase 2 — Stats & leaderboard (Week 5–7)

**Work**
- Materialize `tipster_stats`: ROI, yield, CLV, win rate, max drawdown, current streak.
- Leaderboard with minimum sample-size filter (e.g. 50+ picks).
- Tipster profile pages.

**Exit criteria**
- Leaderboard reflects **only** verified settled picks and updates within minutes of settlement.

---

## Phase 3 — Monetization (Week 7–9)

**Work**
- Stripe subscriptions + gated pick access.
- Stripe Connect payouts + platform fee (20–30%).
- Notifications (email + web push) on new picks.

**Exit criteria**
- A user can subscribe, receive live picks, and a tipster gets paid out.

---

## Phase 4 — Hardening & launch (Week 9–12)

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
