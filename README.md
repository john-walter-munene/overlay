# Overlay Bets

> Verified sports tipster marketplace. Picks are cryptographically locked before kickoff, so track records can't be faked. Bettors follow tipsters ranked by **real** ROI and **Closing Line Value (CLV)** — not screenshots.

**Tagline:** _Find the overlay. Beat the close._

An **overlay** is a bet where the offered odds are higher than the true probability warrants — a positive expected value (+EV) bet. Our platform proves which tipsters consistently find them.

---

## Why this exists

Most tipster sites are unaccountable — losing picks get deleted, records are cherry-picked screenshots, and "guaranteed wins" are scams. Overlay Bets makes every pick **immutable and independently gradable**:

- Picks are hash-locked + timestamped **before** the event starts.
- Settlement is automated from a sports-data API — tipsters can't edit results.
- Rankings use **CLV**, the metric that actually separates skill from luck.

We sell **data, tools, and picks** — we do **not** take bets (keeps us out of gambling licensing in v1).

---

## Repository contents

| Path | What it is |
|---|---|
| `docs/SPEC.md` | Full MVP spec + path to production |
| `docs/ARCHITECTURE.md` | v1 system architecture — components, data model, flows, stack |
| `docs/ROADMAP.md` | Phased delivery plan (Phase 0–4) with exit criteria |
| `docs/NAMING.md` | Branding rationale + name/domain candidates |
| `docs/VENDOR-SPIKE.md` | Sports-data vendor evaluation brief (the critical first task) |
| `docs/DEPLOY.md` | Deployment runbook — provision Postgres+Redis, deploy API+worker, migrate, smoke test |

---

## The moat

> **You cannot fake, edit, or delete a losing pick.**

Every design decision serves that one principle.
