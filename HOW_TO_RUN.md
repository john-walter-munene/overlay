# How to Run Overlay Bets

A step-by-step guide to get the platform running locally, then push it to GitHub.
Everything runs **offline with mock providers** — no Stripe or sports-data API
keys are required for a first test.

---

## 1. Prerequisites

| Tool | Version | Check |
|---|---|---|
| **Node.js** | ≥ 22 | `node -v` |
| **npm** | ≥ 10 | `npm -v` |
| **Docker Desktop** | any recent | `docker -v` |
| **Git** | any recent | `git -v` |

> This repo uses **npm workspaces** (not pnpm). Just use `npm`.

---

## 2. Install dependencies

From the repository root (`overlay-bets/`):

```bash
npm install
```

This installs all workspaces: `packages/shared`, `apps/api`, `apps/web`.

---

## 3. Start Postgres + Redis

```bash
npm run db:up      # docker compose up -d (Postgres :5432, Redis :6379)
```

Stop them later with `npm run db:down`.

---

## 4. Configure environment

```bash
cp .env.example .env
```

The defaults work out of the box for local testing:

- `DATABASE_URL` → the docker Postgres
- `PAYMENTS_PROVIDER=mock` → no Stripe needed
- `SPORTS_API_PROVIDER` → set to `mock` for keyless testing (see note below)
- `WORKER_MODE=interval` → no Redis needed for the worker

> **Tip:** For a fully keyless first run, set `SPORTS_API_PROVIDER=mock` in `.env`.
> Switch to `the-odds-api` / `api-football` later once you have keys.

### Auth (Supabase)

This project uses **Supabase Auth** (OB-145). Create a free project at
[supabase.com](https://supabase.com), then set in `.env`:

- `SUPABASE_URL` — Project Settings → API → **Project URL** (the API verifies
  access tokens against the project's JWKS — no secret needed).
- `NEXT_PUBLIC_SUPABASE_URL` — same URL (browser client).
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Project Settings → API → **anon public** key.

In the Supabase dashboard: enable **Auth → Providers → Email**, and add your
local + deployed origins under **Auth → URL Configuration → Redirect URLs**.
For quick local testing, turn **"Confirm email" off** so signup logs you in
immediately (otherwise you must confirm via the emailed link first).

### Storage (Supabase — identity documents)

Tipster identity documents (ID / passport / driver licence) uploaded during
onboarding are stored in a **private Supabase Storage bucket** (OB-020).

1. In the Supabase dashboard: **Storage → New bucket** → name
   `identity-documents`, and keep **Public** _off_ (private bucket).
2. Set in `.env` (API side):
   - `SUPABASE_SERVICE_ROLE_KEY` — Project Settings → API → **service_role**
     secret. Server-only — never expose it to the browser or commit it.
   - `SUPABASE_STORAGE_BUCKET` — `identity-documents` (default).

Documents are written with the service role key and only ever read back through
short-lived **signed URLs** minted server-side (admins review them from the
Users console). When `SUPABASE_SERVICE_ROLE_KEY` is unset the API falls back to
a local `UPLOAD_DIR` (`./uploads`) so local dev works with zero config.

---

## 5. Set up the database

```bash
npm run prisma:generate     # generate the Prisma client
npm run prisma:migrate      # create tables (name the migration e.g. "init")
npm run db:seed             # admin user, 3 blog articles + 3 upcoming events
```

The seed prints the admin credentials (defaults: `admin@overlay.local` /
`change-me-now` — override with `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

### Backups & disaster recovery

`npm run db:backup` writes a compressed `pg_dump` archive, and
`npm run db:restore-drill` proves a backup restores cleanly into a throwaway
scratch database. Scheduled backups and the full recovery procedure live in
[docs/DR-RUNBOOK.md](docs/DR-RUNBOOK.md).

---

## 6. Run the apps

Open **two terminals** from the repo root:

**Terminal 1 — API** (http://localhost:4000)
```bash
npm run start:dev -w @overlay/api
```

**Terminal 2 — Web** (http://localhost:3000)
```bash
npm run dev -w @overlay/web
```

Then open **http://localhost:3000**.

### (Optional) Settlement worker

The worker grades picks, captures closing odds, and recomputes stats. It's
**not required** for a first click-through, but to run it:

```bash
# Build once, then run (interval mode — no Redis needed)
npm run build -w @overlay/api
npm run start:worker -w @overlay/api

# Or queue mode (needs Redis, which db:up already started):
WORKER_MODE=queue npm run start:worker -w @overlay/api
```

---

## 7. Try the full flow

1. **Browse** the leaderboard and the **/blog** (seeded articles).
2. **Sign up** at `/signup` as a **Tipster** → you land on **/dashboard**.
3. **Submit a pick** from the dashboard — the seed already created a few
   upcoming fixtures, so they appear in the event dropdown immediately. The
   pick is hash-locked instantly.
   > To pull **more/fresh** fixtures, an admin can ingest them (admin-only):
   > ```bash
   > # log in to get a token, then:
   > curl -X POST http://localhost:4000/api/events/ingest \
   >   -H "authorization: Bearer <ADMIN_JWT>" \
   >   -H "content-type: application/json" \
   >   -d '{"sport":"soccer"}'
   > ```
   > (With `SPORTS_API_PROVIDER=mock`, this returns mock fixtures.)
4. In another account, **subscribe** to a tipster from their profile → the mock
   checkout returns to `/subscribe/success` and activates the subscription.
5. **Admin** endpoints live under `/api/admin/*` (dashboard, users, audit log).

---

## 8. Run the tests

Pure-logic tests run with **zero install** using Node's native type stripping:

```bash
npm run test:unit     # stats, integrity, content, payouts, vendor mappers
```

---

## 9. Push to GitHub

The project is already a git repo. To publish it:

```bash
# 1. Create an EMPTY repo on GitHub (no README/license), copy its URL.

# 2. From overlay-bets/:
git remote add origin https://github.com/<you>/overlay-bets.git
git branch -M main
git push -u origin main
```

> `.gitignore` already excludes `node_modules`, `.env`, build output, and
> Prisma artifacts, so no secrets are committed. Double-check with
> `git status` before pushing.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `corepack`/`pnpm` errors | Ignore — this repo uses **npm**, not pnpm. |
| Web can't reach API (CORS) | Ensure API is on `:4000` and `CORS_ORIGINS` includes `http://localhost:3000`. |
| `prisma migrate` can't connect | Is `npm run db:up` running? Check `docker ps`. |
| Port already in use | Change `API_PORT` (.env) or the web port in `apps/web/package.json`. |
| Worker won't start in queue mode | Redis must be up (`npm run db:up`) and `REDIS_URL` set. |
| Type errors on `npm run build` | Run `npm run build` and share the output — some adapter response shapes need live validation. |

---

## What needs real keys (later, for production)

- **Stripe** — set `PAYMENTS_PROVIDER=stripe`, `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, and wire Connect onboarding.
- **Sports data** — set `SPORTS_API_PROVIDER` + `SPORTS_API_KEY`
  (see `docs/VENDOR-SPIKE.md`).
- **Email / Web Push** — `RESEND_API_KEY`, `VAPID_*`. For email, set
  `NOTIFIER_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM`; leave
  `NOTIFIER_PROVIDER=mock` (default) to log instead of sending. For browser web
  push (new-pick alerts), generate a key pair with
  `npx web-push generate-vapid-keys` and set `VAPID_PUBLIC_KEY`,
  `VAPID_PRIVATE_KEY` (and optionally `VAPID_SUBJECT`); with the keys unset the
  push channel is a no-op.

See `docs/ARCHITECTURE.md` and `docs/ROADMAP.md` (Phase 4) for the hardening
checklist before going live.
