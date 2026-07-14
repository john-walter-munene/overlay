# Overlay Bets — Production-Readiness Backlog

> A categorized, issue-ready backlog to take the platform from "mock-level MVP walking skeleton"
> to production. Each item is written so it can be copy-pasted as a GitHub issue and assigned to
> an AI agent. **Every issue includes acceptance criteria and required tests.**
>
> **Legend** — Priority: `P0` (blocks launch) · `P1` (needed for a credible launch) · `P2` (fast-follow).
> IDs are stable (`OB-###`); reference them in `Depends on`.
>
> **Current baseline (already done):** auth (register/login/JWT/roles), pick submit+lock+audit,
> settlement worker (capture closing odds → grade → CLV → recompute stats), stats engine + leaderboard,
> tipster profiles, mock payments + Stripe skeleton, mock notifier, admin **API** (no UI), blog/articles,
> events ingest, seed with dummy tipsters. Web pages: home, blog, login, signup, account, tipster dashboard,
> subscribe, tipster profile.

---

## Table of contents

1. [Authentication & Account Management](#1-authentication--account-management)
2. [User (Bettor) Flows & UI](#2-user-bettor-flows--ui)
3. [Tipster Flows & UI](#3-tipster-flows--ui)
4. [Admin Dashboard & Moderation UI](#4-admin-dashboard--moderation-ui)
5. [Picks & Integrity](#5-picks--integrity)
6. [Events, Settlement & Sports Data](#6-events-settlement--sports-data)
7. [Stats & Leaderboard](#7-stats--leaderboard)
8. [Subscriptions & Payments (Stripe)](#8-subscriptions--payments-stripe)
9. [Payouts (Stripe Connect)](#9-payouts-stripe-connect)
10. [Notifications (Email + Web Push)](#10-notifications-email--web-push)
11. [Content, Blog & SEO](#11-content-blog--seo)
12. [Security & Compliance](#12-security--compliance)
13. [Observability & Ops](#13-observability--ops)
14. [Infrastructure & Deployment](#14-infrastructure--deployment)
15. [Testing & QA](#15-testing--qa)
16. [Data & Database](#16-data--database)
17. [Performance & Caching](#17-performance--caching)
18. [Legal & Trust](#18-legal--trust)

---

## 1. Authentication & Account Management

### OB-001 — Move JWT off localStorage to httpOnly cookies
**Category:** Auth · **Priority:** P0
**Description:** Tokens are currently stored in `localStorage` (`apps/web/lib/auth.ts`), exposing them to XSS. Move to httpOnly, Secure, SameSite cookies set by the API; add CSRF protection for cookie-based mutations.
**Acceptance criteria:**
- [ ] Login/register set an httpOnly Secure cookie; client no longer reads the raw token.
- [ ] API reads the JWT from the cookie (and/or Authorization header for API clients).
- [ ] CSRF token/double-submit protection on state-changing requests.
**Tests:**
- [ ] Integration: login sets cookie; protected route works with cookie only.
- [ ] Integration: request without CSRF token is rejected.

### OB-002 — Refresh tokens & session revocation
**Category:** Auth · **Priority:** P1 · **Depends on:** OB-001
**Description:** Add short-lived access tokens + long-lived refresh tokens with rotation and a server-side revocation list (logout, password change invalidates sessions).
**Acceptance criteria:**
- [ ] Access token TTL ≤ 15 min; refresh rotates on use; reuse detection revokes the family.
- [ ] Logout revokes the refresh token.
**Tests:**
- [ ] Integration: expired access token refreshes successfully; revoked refresh token is rejected.

### OB-003 — Email verification flow
**Category:** Auth · **Priority:** P1 · **Depends on:** OB-030 (email)
**Description:** Require email verification before a tipster can publish picks or a user can subscribe. Token-based verify link, resend, expiry.
**Acceptance criteria:**
- [ ] Signup sends a verification email; unverified accounts are flagged.
- [ ] Verify + resend endpoints and UI pages.
**Tests:**
- [ ] Integration: verify token activates account; expired/invalid token rejected.

### OB-004 — Password reset (forgot password)
**Category:** Auth · **Priority:** P1 · **Depends on:** OB-030 (email)
**Description:** Forgot-password request → emailed reset link → set new password; single-use, expiring token.
**Acceptance criteria:**
- [ ] Request, reset pages + endpoints; token single-use and time-limited.
- [ ] All sessions invalidated on password change.
**Tests:**
- [ ] Integration: full reset happy path; reused token rejected.

### OB-005 — Password strength & breach checks
**Category:** Auth · **Priority:** P2
**Description:** Enforce minimum password policy and optionally check against known-breached passwords (k-anonymity API).
**Acceptance criteria:**
- [ ] Weak passwords rejected with clear messaging on signup and reset.
**Tests:**
- [ ] Unit: password policy validator; boundary cases.

### OB-006 — Account settings UI (email, password, delete account)
**Category:** Auth · **Priority:** P1
**Description:** Expand `/account` to manage email, change password, and request account deletion (GDPR).
**Acceptance criteria:**
- [ ] Change email (re-verify), change password, delete-account with confirmation.
**Tests:**
- [ ] Component/e2e: change password happy + error paths.

### OB-007 — Rate limiting on auth endpoints
**Category:** Auth · **Priority:** P0
**Description:** Add throttling (per-IP + per-account) on login/register/reset to prevent credential stuffing and enumeration. Return non-enumerating errors.
**Acceptance criteria:**
- [ ] Login/register/reset are rate-limited; lockout/backoff after N failures.
- [ ] Errors don't reveal whether an email exists.
**Tests:**
- [ ] Integration: exceeding threshold returns 429.

---

## 2. User (Bettor) Flows & UI

### OB-010 — Marketplace / tipster discovery page
**Category:** User UI · **Priority:** P0
**Description:** A browse/search page listing verified tipsters with filters (sport, price, min sample, sort by yield/CLV/win rate). Currently only a raw leaderboard exists.
**Acceptance criteria:**
- [ ] Filter + sort + paginate; empty and loading states; SEO-friendly SSR.
**Tests:**
- [ ] e2e: filter narrows results; sort reorders.

### OB-011 — Tipster profile page polish (paywall preview)
**Category:** User UI · **Priority:** P0
**Description:** Profile shows verified stats + settled track record publicly, with a clear "subscribe to see live picks" paywall preview and integrity/hash explainer.
**Acceptance criteria:**
- [ ] Public: stats, settled picks, CLV chart. Gated: live picks behind subscription CTA.
- [ ] "How verification works" explainer with hash/timestamp detail.
**Tests:**
- [ ] e2e: non-subscriber sees preview; subscriber sees live picks.

### OB-012 — Subscriber "My feed" (live picks) page
**Category:** User UI · **Priority:** P0
**Description:** A logged-in subscriber view aggregating live/pending picks from all subscribed tipsters, newest first, with settlement status updates.
**Acceptance criteria:**
- [ ] Aggregated feed; entitlement-checked; realtime or polled updates.
**Tests:**
- [ ] e2e: only entitled tipsters' picks appear.

### OB-013 — Subscriptions management UI
**Category:** User UI · **Priority:** P1
**Description:** Page to view active/canceled subscriptions, next billing date, and cancel/resume (Stripe billing portal link).
**Acceptance criteria:**
- [ ] List subs with status + period end; cancel/resume via portal.
**Tests:**
- [ ] e2e: cancel reflects status change after webhook.

### OB-014 — Onboarding & empty states
**Category:** User UI · **Priority:** P2
**Description:** First-run onboarding for new users/tipsters and friendly empty states across pages (no subs, no picks, no events).
**Acceptance criteria:**
- [ ] Empty states with CTAs on feed, dashboard, subscriptions.
**Tests:**
- [ ] Component: empty-state renders when data is empty.

### OB-015 — Global nav, footer, responsive layout & a11y pass
**Category:** User UI · **Priority:** P1
**Description:** Consistent header/footer, mobile responsiveness, keyboard nav, ARIA labels, color-contrast (WCAG AA).
**Acceptance criteria:**
- [ ] Passes axe checks on key pages; mobile breakpoints verified.
**Tests:**
- [ ] Automated a11y (axe) in e2e for home, profile, dashboard.

### OB-016 — Design system / shared UI components
**Category:** User UI · **Priority:** P2
**Description:** Replace ad-hoc inline styles (`formStyles.ts`) with a small component library (Button, Card, Table, Badge, Stat) + Tailwind, per the stack in ARCHITECTURE.md.
**Acceptance criteria:**
- [ ] Core components used across pages; consistent theming.
**Tests:**
- [ ] Component tests / stories for each primitive.

---

## 3. Tipster Flows & UI

### OB-020 — Tipster onboarding wizard
**Category:** Tipster UI · **Priority:** P1
**Description:** Guided setup: bio, sports, pricing, Stripe Connect onboarding, verification. Gate publishing until complete.
**Acceptance criteria:**
- [ ] Multi-step wizard; progress persisted; can't publish until required steps done.
**Tests:**
- [ ] e2e: wizard completion unlocks pick publishing.

### OB-021 — Tipster profile editor UI
**Category:** Tipster UI · **Priority:** P1
**Description:** UI for the existing `updateProfile` (bio, sports, subscription price). Currently API-only.
**Acceptance criteria:**
- [ ] Edit + save with validation; price in currency units.
**Tests:**
- [ ] e2e: edit persists and reflects on public profile.

### OB-022 — Pick submission UX hardening
**Category:** Tipster UI · **Priority:** P1
**Description:** Improve the dashboard pick form: market-specific selection inputs (1X2/moneyline/spread/totals), odds format toggle (decimal/American), confirmation modal, optimistic UI, error surfacing.
**Acceptance criteria:**
- [ ] Selection UI adapts to market; invalid combos blocked client-side; confirm before lock.
**Tests:**
- [ ] Component: market→selection mapping; e2e: submit + lock happy/late-event paths.

### OB-023 — Tipster performance dashboard
**Category:** Tipster UI · **Priority:** P1
**Description:** Charts for the tipster's own ROI/yield/CLV/win-rate over time, streaks, drawdown, and pending vs settled breakdown.
**Acceptance criteria:**
- [ ] Time-series + summary cards from stats + pick history.
**Tests:**
- [ ] Component: renders with seeded data; handles empty.

### OB-024 — Tipster earnings & payouts UI
**Category:** Tipster UI · **Priority:** P1 · **Depends on:** OB-040
**Description:** Show projected/current earnings, platform fee, subscriber count, and payout history/status.
**Acceptance criteria:**
- [ ] Earnings summary + payout list with statuses.
**Tests:**
- [ ] e2e: earnings reflect active subscribers and fee rate.

---

## 4. Admin Dashboard & Moderation UI

### OB-025 — Admin dashboard UI (metrics)
**Category:** Admin UI · **Priority:** P1
**Description:** Build `/admin` route consuming `GET /api/admin/dashboard`; metric cards (users, tipsters, active subs, picks, settled, pending payouts, articles). Role-gated.
**Acceptance criteria:**
- [ ] Admin-only route; redirects non-admins; renders live metrics.
**Tests:**
- [ ] e2e: admin sees dashboard; non-admin is redirected/403.

### OB-026 — Admin users management UI
**Category:** Admin UI · **Priority:** P1
**Description:** Paginated users table with role change and tipster suspend/reinstate (wire existing PATCH endpoints).
**Acceptance criteria:**
- [ ] Search/paginate; change role; suspend/reinstate with confirmation + audit note.
**Tests:**
- [ ] e2e: role change and suspension reflect after action.

### OB-027 — Admin audit-log viewer UI
**Category:** Admin UI · **Priority:** P2
**Description:** Filterable audit-log table (by entity, actor, action, date) from `GET /api/admin/audit-log`.
**Acceptance criteria:**
- [ ] Filter + paginate; readable payload rendering.
**Tests:**
- [ ] e2e: filter by entity returns expected rows.

### OB-028 — Admin content moderation (articles) UI
**Category:** Admin UI · **Priority:** P2
**Description:** Authoring/editing UI for blog articles (draft/publish/archive) using existing articles module.
**Acceptance criteria:**
- [ ] Create/edit/publish/archive with preview.
**Tests:**
- [ ] e2e: publish transitions article to public list.

### OB-029 — Admin pick/settlement oversight
**Category:** Admin UI · **Priority:** P2
**Description:** Read-only view of recent settlements, manual re-run trigger for a stuck cycle, and void-with-reason (audited) for objective data errors.
**Acceptance criteria:**
- [ ] View settlement outcomes; trigger re-run; void requires reason + audit entry.
**Tests:**
- [ ] Integration: manual void writes audit + recomputes stats.

---

## 5. Picks & Integrity

### OB-035 — DB-level pick immutability (append-only enforcement)
**Category:** Integrity · **Priority:** P0
**Description:** ARCHITECTURE.md mandates DB-enforced immutability; today it's app-layer only. Add a Postgres trigger/rule preventing UPDATE of core pick fields post-lock (only settlement fields writable, and only once).
**Acceptance criteria:**
- [ ] Direct SQL UPDATE of core fields (market/selection/odds/hash/nonce/lockedAt) is rejected.
- [ ] Settlement fields writable only on pending→terminal transition.
**Tests:**
- [ ] Integration: attempt to mutate a locked pick's odds fails at DB layer.

### OB-036 — Pick hash verification endpoint & public proof
**Category:** Integrity · **Priority:** P1
**Description:** Public endpoint + UI to verify a pick's hash against its revealed payload + nonce (proving no tampering). Uses `verifyPick` from shared.
**Acceptance criteria:**
- [ ] Given a pick, anyone can verify hash integrity; UI shows verified badge.
**Tests:**
- [ ] Unit: verify passes for genuine, fails for altered payload (already partly covered — extend).

### OB-037 — Daily Merkle root anchoring (OpenTimestamps) [stretch]
**Category:** Integrity · **Priority:** P2
**Description:** Compute a daily Merkle root over pick hashes and anchor via OpenTimestamps/public chain so even the platform can't backdate.
**Acceptance criteria:**
- [ ] Daily root computed, stored, and anchored; verification instructions documented.
**Tests:**
- [ ] Unit: Merkle root + inclusion proof; integration: anchor job runs idempotently.

### OB-038 — Late-pick & cutoff hardening
**Category:** Integrity · **Priority:** P1
**Description:** Enforce a configurable cutoff before kickoff (not just start-time), clock-skew tolerance, and reject picks on events with missing/invalid start times.
**Acceptance criteria:**
- [ ] Configurable cutoff; server-clock authoritative; edge cases rejected with clear errors.
**Tests:**
- [ ] Unit/integration: pick at cutoff boundary; event without start time.

---

## 6. Events, Settlement & Sports Data

### OB-045 — Real sports-data vendor integration & validation
**Category:** Sports Data · **Priority:** P0
**Description:** Provision a real vendor (The Odds API / API-Football), validate fixtures, pre-match odds, **closing odds**, and results end-to-end against the existing adapters/mappers.
**Acceptance criteria:**
- [ ] With a live key, ingest → capture closing odds → settle → CLV works on real fixtures.
- [ ] Documented vendor choice + rate limits + cost in VENDOR-SPIKE.md.
**Tests:**
- [ ] Integration (recorded fixtures): mapper handles real payload shapes; settlement grades correctly.

### OB-046 — Scheduled ingestion & closing-odds capture jobs
**Category:** Sports Data · **Priority:** P0
**Description:** Move ingestion + closing-odds capture to reliable scheduled jobs (BullMQ repeatable) with per-event kickoff-timed capture, not just an admin endpoint / single interval.
**Acceptance criteria:**
- [ ] Cron ingest; closing odds captured close to kickoff per event; idempotent.
**Tests:**
- [ ] Integration: closing odds captured exactly once per event.

### OB-047 — Dual-source settlement / result reconciliation [stretch]
**Category:** Sports Data · **Priority:** P2
**Description:** Optional second results source with reconciliation to reduce mis-grades; flag disputes for admin review.
**Acceptance criteria:**
- [ ] Disagreements flagged, not auto-settled; audit trail.
**Tests:**
- [ ] Unit: reconciliation logic for agree/disagree/missing.

### OB-048 — Settlement resilience (retries, DLQ, alerting)
**Category:** Sports Data · **Priority:** P1
**Description:** Add retry/backoff, dead-letter handling, and alerting for vendor outages and failed settlement cycles.
**Acceptance criteria:**
- [ ] Failed jobs retried with backoff; exhausted jobs alert; no silent data loss.
**Tests:**
- [ ] Integration: transient vendor error retries then succeeds; permanent error alerts.

### OB-049 — Market coverage & void rules
**Category:** Sports Data · **Priority:** P1
**Description:** Define and implement grading + void rules per supported market (1X2, moneyline, spread, totals), including push/half-win and postponed/abandoned handling.
**Acceptance criteria:**
- [ ] Each market graded correctly incl. push/void; postponed → void per policy.
**Tests:**
- [ ] Unit: grading matrix per market with edge cases (push, OT, postponement).

---

## 7. Stats & Leaderboard

### OB-055 — Leaderboard caching & incremental updates
**Category:** Stats · **Priority:** P1
**Description:** Cache leaderboard (Redis) and invalidate on settlement so it "updates within minutes" per exit criteria, without full recompute per request.
**Acceptance criteria:**
- [ ] Cached reads; cache invalidated after stats recompute.
**Tests:**
- [ ] Integration: settlement invalidates cache; stale data not served.

### OB-056 — Configurable minimum sample & confidence indicators
**Category:** Stats · **Priority:** P2
**Description:** Make min-sample a platform setting; show confidence bands / "provisional" badges for low-sample tipsters (currently threshold lowered to 10 for dev).
**Acceptance criteria:**
- [ ] Setting-driven threshold; UI badge for provisional records.
**Tests:**
- [ ] Unit: threshold filtering; component: badge visibility.

### OB-057 — Additional verified metrics (CLV distribution, ROI by sport)
**Category:** Stats · **Priority:** P2
**Description:** Extend the stats engine with CLV distribution, ROI by sport/market, and time-windowed performance (30/90/all-time).
**Acceptance criteria:**
- [ ] New metrics computed deterministically and surfaced on profiles.
**Tests:**
- [ ] Unit: new metric correctness against fixtures.

---

## 8. Subscriptions & Payments (Stripe)

### OB-060 — Complete Stripe subscription integration
**Category:** Payments · **Priority:** P0
**Description:** Finish `StripePaymentProvider`: per-tipster Stripe Products/Prices, checkout, and full webhook handling (`checkout.session.completed`, `customer.subscription.updated/deleted`, `invoice.payment_failed`).
**Acceptance criteria:**
- [ ] Real checkout creates a subscription; all lifecycle webhooks update local state.
- [ ] Idempotent webhook processing (event id dedupe).
**Tests:**
- [ ] Integration (Stripe test mode / mocked events): each webhook transitions state correctly; duplicate event ignored.

### OB-061 — Stripe webhook signature verification
**Category:** Payments · **Priority:** P0 · **Depends on:** OB-060
**Description:** Verify `Stripe-Signature` against `STRIPE_WEBHOOK_SECRET` using the raw body (already preserved in `main.ts`); reject unsigned/invalid.
**Acceptance criteria:**
- [ ] Invalid signature → 400; valid → processed exactly once.
**Tests:**
- [ ] Integration: tampered payload rejected; valid signature accepted.

### OB-062 — Entitlement edge cases (grace periods, past_due, proration)
**Category:** Payments · **Priority:** P1 · **Depends on:** OB-060
**Description:** Handle `past_due` grace access, cancellation at period end (retain access until `currentPeriodEnd`), and re-subscribe.
**Acceptance criteria:**
- [ ] Access matches billing state incl. grace/cancel-at-period-end.
**Tests:**
- [ ] Integration: entitlement true until period end after cancel; false after.

### OB-063 — Stripe Billing Portal integration
**Category:** Payments · **Priority:** P1 · **Depends on:** OB-060
**Description:** Generate billing-portal sessions so users manage/cancel subscriptions and payment methods.
**Acceptance criteria:**
- [ ] Portal link from subscriptions UI; returns to app.
**Tests:**
- [ ] Integration: portal session created for a customer.

### OB-064 — Tax, currency & receipts
**Category:** Payments · **Priority:** P2
**Description:** Configure Stripe Tax (or manual), multi-currency display, and emailed receipts/invoices.
**Acceptance criteria:**
- [ ] Correct tax/currency on checkout; receipts delivered.
**Tests:**
- [ ] Integration: tax applied for a test region.

---

## 9. Payouts (Stripe Connect)

### OB-040 — Stripe Connect onboarding for tipsters
**Category:** Payouts · **Priority:** P0
**Description:** Implement Connect Express onboarding (account link), store `stripeAccountId`, and block payouts until onboarding/verification complete.
**Acceptance criteria:**
- [ ] Tipster completes Connect onboarding; status tracked; incomplete blocks payout.
**Tests:**
- [ ] Integration: onboarding link created; account status persisted.

### OB-041 — Real payout transfers + platform fee
**Category:** Payouts · **Priority:** P0 · **Depends on:** OB-040, OB-060
**Description:** Wire `run-payouts` to real Connect transfers using existing payout math (`payouts.math.ts`, `PLATFORM_FEE_RATE`); record `stripeTransferId` and status transitions.
**Acceptance criteria:**
- [ ] Monthly job computes net = gross − fee and transfers to each tipster; idempotent per period.
**Tests:**
- [ ] Integration: payout created once per period; retries don't double-pay.

### OB-042 — Payout reconciliation & failure handling
**Category:** Payouts · **Priority:** P1 · **Depends on:** OB-041
**Description:** Handle failed/reversed transfers, reconcile against Stripe balance, and surface failures to admin.
**Acceptance criteria:**
- [ ] Failed transfers marked + retried; admin alerted; ledger reconciles.
**Tests:**
- [ ] Integration: failed transfer sets status=failed and alerts.

---

## 10. Notifications (Email + Web Push)

### OB-030 — Transactional email provider (Resend)
**Category:** Notifications · **Priority:** P0
**Description:** Implement a real `Notifier` using Resend for transactional email (verify, reset, receipts, new-pick digests). Replace mock in prod via env.
**Acceptance criteria:**
- [ ] Emails sent via Resend in prod; mock retained for dev/test; templates for each type.
**Tests:**
- [ ] Integration: notifier called with correct template/recipient (provider mocked).

### OB-031 — Web Push (VAPID) notifications
**Category:** Notifications · **Priority:** P1
**Description:** Implement browser web push (VAPID keys already in env) for new-pick alerts; subscription management + service worker.
**Acceptance criteria:**
- [ ] Users opt in; new pick triggers push to subscribers; unsubscribe works.
**Tests:**
- [ ] Integration: push dispatched on new pick to opted-in subscribers.

### OB-032 — New-pick fan-out pipeline (queue-based)
**Category:** Notifications · **Priority:** P1 · **Depends on:** OB-030
**Description:** Move new-pick notification from inline `await` (see `picks.service.ts`) to a queued fan-out job for reliability and scale.
**Acceptance criteria:**
- [ ] Pick creation enqueues fan-out; retries on failure; no blocking of pick response.
**Tests:**
- [ ] Integration: pick create enqueues job; worker delivers to all subscribers.

### OB-033 — Notification preferences & digests
**Category:** Notifications · **Priority:** P2
**Description:** Per-user preferences (email/push/off, instant vs daily digest) + unsubscribe links (CAN-SPAM).
**Acceptance criteria:**
- [x] Preferences respected; one-click unsubscribe; digest batching.
**Tests:**
- [x] Integration: opted-out user receives nothing; digest batches correctly.

---

## 11. Content, Blog & SEO

### OB-070 — SEO metadata, OpenGraph & structured data
**Category:** SEO · **Priority:** P1
**Description:** Per-page metadata, OG/Twitter cards, JSON-LD for articles and tipster profiles; verify sitemap/robots.
**Acceptance criteria:**
- [ ] Rich previews on share; valid structured data; sitemap includes profiles.
**Tests:**
- [ ] e2e/snapshot: meta tags present on key pages.

### OB-071 — Blog authoring workflow & images
**Category:** Content · **Priority:** P2
**Description:** Admin authoring UI (OB-028) plus cover-image upload/storage and markdown preview.
**Acceptance criteria:**
- [ ] Author with images; safe markdown rendering (sanitized).
**Tests:**
- [ ] Unit: markdown sanitization blocks XSS.

### OB-072 — Marketing/landing pages
**Category:** Content · **Priority:** P2
**Description:** Home/landing polish explaining the trust model, pricing, and FAQ for cold-start conversion.
**Acceptance criteria:**
- [ ] Landing, pricing, FAQ pages live.
**Tests:**
- [ ] e2e: nav to each page renders.

---

## 12. Security & Compliance

### OB-080 — Global rate limiting & abuse protection
**Category:** Security · **Priority:** P0
**Description:** API-wide rate limiting (per-IP/per-user), especially pick submission and auth; add bot/abuse protection.
**Acceptance criteria:**
- [ ] Throttling on sensitive routes; configurable limits.
**Tests:**
- [ ] Integration: limits enforced; normal usage unaffected.

### OB-081 — Input validation & output encoding audit
**Category:** Security · **Priority:** P1
**Description:** Ensure all DTOs validated (class-validator), enforce size limits, and sanitize any user-generated content (bio, article body) against XSS.
**Acceptance criteria:**
- [ ] All endpoints validate input; UGC sanitized; no reflected/stored XSS.
**Tests:**
- [ ] Integration: malformed/oversized payloads rejected; XSS payload neutralized.

### OB-082 — Secrets management & key rotation
**Category:** Security · **Priority:** P0
**Description:** Remove `change-me` defaults for `JWT_SECRET`, `PICK_HASH_PEPPER`; require strong secrets from env; document rotation (esp. pepper implications).
**Acceptance criteria:**
- [ ] App refuses to boot in prod with default/weak secrets; rotation runbook exists.
**Tests:**
- [ ] Unit: boot guard rejects default secrets when NODE_ENV=production.

### OB-083 — Security headers & CORS hardening
**Category:** Security · **Priority:** P1
**Description:** Add Helmet-style headers (CSP, HSTS, X-Frame-Options), and lock `CORS_ORIGINS` to known domains.
**Acceptance criteria:**
- [ ] Security headers present; CORS restricted to configured origins.
**Tests:**
- [ ] Integration: headers asserted; disallowed origin blocked.

### OB-084 — Authorization matrix review & tests
**Category:** Security · **Priority:** P0
**Description:** Verify every endpoint enforces correct role/ownership (tipster can only edit own; only settlement worker writes results; entitlement gates pick reads).
**Acceptance criteria:**
- [ ] Documented authz matrix; each rule enforced.
**Tests:**
- [ ] Integration: cross-tenant access attempts denied for each role.

### OB-085 — GDPR/data-subject requests & retention
**Category:** Compliance · **Priority:** P1
**Description:** Export + delete user data flows, retention policy, and PII minimization.
**Acceptance criteria:**
- [ ] Export/delete endpoints; retention documented; audit of PII stored.
**Tests:**
- [ ] Integration: delete removes/anonymizes PII while preserving append-only pick integrity.

### OB-086 — Dependency & container vulnerability scanning
**Category:** Security · **Priority:** P1
**Description:** Add `npm audit`/Dependabot + image scanning to CI; triage the current 22 advisories.
**Acceptance criteria:**
- [ ] CI fails on new high/critical; existing advisories triaged.
**Tests:**
- [ ] CI job present and gating.

---

## 13. Observability & Ops

### OB-090 — Error tracking (Sentry) across web, API, workers
**Category:** Observability · **Priority:** P0
**Description:** Integrate Sentry for unhandled errors + performance traces in all three runtimes.
**Acceptance criteria:**
- [ ] Errors reported with release + environment; source maps uploaded.
**Tests:**
- [ ] Integration: a thrown error surfaces to Sentry (mocked transport).

### OB-091 — Structured logging & request tracing
**Category:** Observability · **Priority:** P1
**Description:** Replace ad-hoc `console.log`/Logger with structured JSON logs + correlation IDs across API and workers.
**Acceptance criteria:**
- [ ] JSON logs with request/job id; log levels configurable.
**Tests:**
- [ ] Unit: logger emits structured fields; correlation id propagates.

### OB-092 — Health checks & readiness/liveness probes
**Category:** Ops · **Priority:** P0
**Description:** Add `/health` (liveness) and `/ready` (DB/Redis connectivity) endpoints for the host/orchestrator.
**Acceptance criteria:**
- [ ] Liveness always fast; readiness checks DB + Redis.
**Tests:**
- [ ] Integration: readiness fails when DB down.

### OB-093 — Metrics & alerting (SLOs)
**Category:** Ops · **Priority:** P1
**Description:** Emit key metrics (settlement latency, webhook failures, queue depth, error rate) and define SLOs + alerts.
**Acceptance criteria:**
- [ ] Dashboards + alerts for defined SLOs; on-call notified on breach.
**Tests:**
- [ ] Integration: metric emitted for a settlement cycle.

### OB-094 — Backups, restore drills & DR runbook
**Category:** Ops · **Priority:** P0
**Description:** Automated Postgres backups, tested restore, and a documented disaster-recovery runbook.
**Acceptance criteria:**
- [ ] Scheduled backups; a restore has been verified; runbook exists.
**Tests:**
- [ ] Drill: restore into a scratch DB succeeds (documented).

### OB-095 — On-call runbook & incident process
**Category:** Ops · **Priority:** P1
**Description:** Runbooks for common incidents (settlement stuck, webhook backlog, vendor outage, payout failure).
**Acceptance criteria:**
- [ ] Runbooks published; escalation path defined.
**Tests:**
- [ ] N/A (doc review checklist).

---

## 14. Infrastructure & Deployment

### OB-100 — API Dockerfile + .dockerignore (monorepo-aware)
**Category:** Infra · **Priority:** P0
**Description:** Multi-stage Dockerfile building `@overlay/shared` then `@overlay/api`, running `prisma generate`, producing a slim runtime image; separate start commands for API and worker.
**Acceptance criteria:**
- [ ] Image builds and runs `node dist/main.js` and `node dist/worker.js`.
**Tests:**
- [ ] CI: docker build succeeds; container starts and passes /health.

### OB-101 — Deploy API + workers + Postgres + Redis (Railway/Fly/Render)
**Category:** Infra · **Priority:** P0 · **Depends on:** OB-100
**Description:** Provision managed Postgres + Redis and deploy API and worker services with prod env; run `prisma migrate deploy`.
**Acceptance criteria:**
- [ ] Public HTTPS API; worker running; migrations applied.
**Tests:**
- [ ] Smoke: prod health + a public endpoint respond.

### OB-102 — Deploy web to Vercel (monorepo root = apps/web)
**Category:** Infra · **Priority:** P0 · **Depends on:** OB-101
**Description:** Vercel project with Root Directory `apps/web`, `NEXT_PUBLIC_API_URL` + `NEXT_PUBLIC_SITE_URL`; update API `CORS_ORIGINS` to the Vercel domain.
**Acceptance criteria:**
- [ ] Web deploys; talks to prod API; CORS passes.
**Tests:**
- [ ] Smoke: home + profile load data from prod API.

### OB-103 — Environments (dev/staging/prod) & config management
**Category:** Infra · **Priority:** P1
**Description:** Separate staging + prod with isolated DBs/secrets; environment-scoped config and preview deploys.
**Acceptance criteria:**
- [ ] Staging mirrors prod; secrets isolated; preview per PR.
**Tests:**
- [ ] Smoke on staging before prod promotion.

### OB-104 — CI/CD pipeline hardening
**Category:** Infra · **Priority:** P1
**Description:** Extend CI (lint gate, typecheck, unit + integration + e2e, migration check) and add CD with migrate-on-deploy and rollback.
**Acceptance criteria:**
- [ ] PRs gated on lint/typecheck/tests; deploy runs migrations; rollback documented.
**Tests:**
- [ ] CI pipeline green on a sample PR with all gates.

### OB-105 — Database migration strategy (prod-safe)
**Category:** Infra · **Priority:** P0
**Description:** Use `prisma migrate deploy` in CD, review destructive migrations, and add a migration for the immutability trigger (OB-035).
**Acceptance criteria:**
- [ ] Migrations applied automatically and safely; destructive changes flagged.
**Tests:**
- [ ] CI: migrations apply cleanly on a fresh DB.

---

## 15. Testing & QA

### OB-110 — API integration test harness (Nest + Testcontainers)
**Category:** Testing · **Priority:** P0
**Description:** Add Jest + Supertest + Testcontainers (Postgres/Redis) to test controllers/services against a real DB. Currently only pure-logic unit tests exist.
**Acceptance criteria:**
- [ ] Harness boots the app against ephemeral PG/Redis; sample suite runs in CI.
**Tests:**
- [ ] Auth, picks, subscriptions happy/error paths.

### OB-111 — End-to-end tests (Playwright)
**Category:** Testing · **Priority:** P1
**Description:** Playwright e2e covering signup→tipster→post pick→settle→subscribe→see live pick across web+API.
**Acceptance criteria:**
- [ ] Core journeys automated; run in CI against a seeded stack.
**Tests:**
- [ ] The above journeys pass headless in CI.

### OB-112 — Settlement pipeline integration tests
**Category:** Testing · **Priority:** P0
**Description:** Integration tests for `SettlementService.runOnce` with mock vendor: capture→grade→CLV→stats, incl. idempotency and void paths.
**Acceptance criteria:**
- [ ] Full cycle asserted; re-running doesn't double-settle.
**Tests:**
- [ ] Idempotency, void, missing-result, partial-market scenarios.

### OB-113 — Web component/unit tests
**Category:** Testing · **Priority:** P2
**Description:** Add React Testing Library for critical components (pick form, profile, subscribe button, admin tables).
**Acceptance criteria:**
- [ ] Key components tested for render + interaction.
**Tests:**
- [ ] Form validation and error rendering.

### OB-114 — Load/performance test on a busy fixture day
**Category:** Testing · **Priority:** P1
**Description:** Load-test settlement + pick submission + leaderboard reads at expected peak; establish capacity baseline.
**Acceptance criteria:**
- [ ] Meets latency SLOs at target load; bottlenecks documented.
**Tests:**
- [ ] k6/Artillery scripts + report.

### OB-115 — Contract tests for external providers
**Category:** Testing · **Priority:** P2
**Description:** Recorded/contract tests for sports vendor + Stripe payloads so adapter changes are caught.
**Acceptance criteria:**
- [ ] Provider payload shapes pinned; breaking changes fail CI.
**Tests:**
- [ ] Mapper/adapter tests against recorded fixtures.

---

## 16. Data & Database

### OB-120 — Indexing & query performance review
**Category:** Database · **Priority:** P1
**Description:** Review indexes for leaderboard, profile, feed, and settlement queries; add missing composite indexes.
**Acceptance criteria:**
- [ ] Hot queries use indexes; no seq-scans on large tables.
**Tests:**
- [ ] Integration: EXPLAIN asserts index usage on key queries.

### OB-121 — Seed vs. production data separation
**Category:** Database · **Priority:** P1
**Description:** Ensure dummy tipsters/seed data never run in prod; separate demo seed from required bootstrap (admin only).
**Acceptance criteria:**
- [ ] Prod bootstrap creates only essential rows; demo seed gated to non-prod.
**Tests:**
- [ ] Unit: seed guard blocks demo data when NODE_ENV=production.

### OB-122 — Data integrity constraints & FKs audit
**Category:** Database · **Priority:** P2
**Description:** Verify FK constraints, unique constraints, and enum coverage; add checks where missing.
**Acceptance criteria:**
- [ ] Referential integrity enforced; orphan rows impossible.
**Tests:**
- [ ] Integration: constraint violations rejected.

---

## 17. Performance & Caching

### OB-130 — Redis caching layer for hot reads
**Category:** Performance · **Priority:** P1
**Description:** Cache leaderboard, tipster profiles, and article lists with sensible TTLs + invalidation hooks.
**Acceptance criteria:**
- [ ] Cache hit path for hot reads; correct invalidation on writes.
**Tests:**
- [ ] Integration: cache populated and invalidated correctly.

### OB-131 — Next.js rendering strategy (ISR/SSG) tuning
**Category:** Performance · **Priority:** P2
**Description:** Use ISR/SSG for public pages (leaderboard, profiles, blog) with revalidation; ensure `revalidate` values are appropriate.
**Acceptance criteria:**
- [ ] Public pages statically served + revalidated; TTFB improved.
**Tests:**
- [ ] e2e: cached page serves, revalidates after change.

### OB-132 — Realtime pick delivery (WebSocket/SSE) [stretch]
**Category:** Performance · **Priority:** P2
**Description:** Replace polling with a realtime channel for live pick delivery to subscribers.
**Acceptance criteria:**
- [ ] Subscribers receive new picks in near-real-time; graceful fallback to polling.
**Tests:**
- [ ] Integration: new pick pushed to connected subscriber.

---

## 18. Legal & Trust

### OB-140 — Terms of Service, Privacy Policy, "no wagering" disclaimers
**Category:** Legal · **Priority:** P0
**Description:** Publish ToS, Privacy Policy, and prominent "we take no bets / information only" disclaimers; cookie consent.
**Acceptance criteria:**
- [ ] Legal pages live + linked in footer; consent captured.
**Tests:**
- [ ] e2e: legal links reachable; consent persists.

### OB-141 — Jurisdiction & paid-tipping compliance review
**Category:** Legal · **Priority:** P0
**Description:** Verify per-jurisdiction rules for paid tipping; geo-restrict where required; confirm Stripe MCC positioning ("tools/data/picks", not gambling).
**Acceptance criteria:**
- [ ] Documented allowed jurisdictions; geo-gating if needed; payment MCC confirmed.
**Tests:**
- [ ] Integration: geo-restricted region blocked from restricted actions (if in scope).

### OB-142 — Responsible-gambling resources & age gate
**Category:** Legal · **Priority:** P1
**Description:** Add responsible-gambling links/resources and an age-confirmation gate.
**Acceptance criteria:**
- [ ] Age gate on entry; RG resources linked.
**Tests:**
- [ ] e2e: age gate blocks until confirmed.

---

## Suggested delivery order (critical path)

1. **Infra unblock:** OB-100 → OB-101 → OB-102 (get something deployed).
2. **Trust core:** OB-035 (DB immutability), OB-045/046 (real data + scheduled settlement), OB-112 (settlement tests).
3. **Money:** OB-040/041 (Connect payouts), OB-060/061/062 (Stripe subs + webhooks).
4. **Security & auth:** OB-001, OB-007, OB-080, OB-082, OB-084, OB-092.
5. **Notifications:** OB-030 → OB-031 → OB-032.
6. **UX completeness:** OB-010/011/012 (user), OB-020–024 (tipster), OB-025–027 (admin).
7. **Observability & ops:** OB-090, OB-094; then SEO, legal (OB-140/141), and fast-follow P2s.

> Recommended labels for issues: `area:*` (auth, payments, payouts, settlement, ui-user, ui-tipster,
> ui-admin, infra, security, observability, testing, legal), `priority:P0|P1|P2`, `type:feature|hardening|test|infra`.
