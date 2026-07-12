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

---

## The moat

> **You cannot fake, edit, or delete a losing pick.**

Every design decision serves that one principle.

---

## Status

Pre-development. Next action: **sports-data vendor spike** (see `docs/VENDOR-SPIKE.md`) — validate reliable **closing-odds** coverage before writing any pick-engine code.

---

## Getting started (local dev)

**Prerequisites:** Node 22+, Docker, npm 10+ (this repo uses **npm workspaces**).

```bash
# 1. Install dependencies (all workspaces)
npm install

# 2. Start Postgres + Redis
npm run db:up

# 3. Configure env
cp .env.example .env        # then fill in secrets

# 4. Generate Prisma client + run migrations
npm run prisma:generate
npm run prisma:migrate

# 5. Run the API and web app (separate terminals)
npm run start:dev -w @overlay/api
npm run dev -w @overlay/web

# Run the correctness-critical stats/integrity tests (no install needed):
npm run test:shared
```

## Monorepo layout

```
overlay-bets/
├── apps/
│   ├── api/           # NestJS modular monolith (HTTP + worker)
│   └── web/           # Next.js (leaderboard, profiles)
├── packages/
│   └── shared/        # stats engine (CLV/ROI) + pick integrity — unit-tested
├── prisma/            # schema + migrations
├── infra/             # docker-compose (Postgres + Redis)
├── .github/workflows/ # CI
└── docs/              # SPEC, ARCHITECTURE, ROADMAP, VENDOR-SPIKE, NAMING
```
