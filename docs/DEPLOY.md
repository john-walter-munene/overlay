# Deployment Runbook (OB-101)

How to provision managed **Postgres + Redis** and deploy the **API** and
**settlement worker** with production config, run database migrations, and
smoke-test the result.

The repo ships a [Render Blueprint](../render.yaml) that provisions everything in
one shot, so Render is the documented path. The same shape (Docker image + env
vars + `prisma migrate deploy`) maps onto Railway or Fly if you prefer.

---

## 1. What gets deployed

| Component | How | Notes |
|---|---|---|
| **Postgres** | `databases:` in `render.yaml` | Managed; `DATABASE_URL` injected into services. |
| **Redis** | `type: redis` service | BullMQ backend; `maxmemoryPolicy: noeviction`. |
| **API (HTTP)** | `type: web`, root [`Dockerfile`](../Dockerfile) | Public HTTPS; health check at `/api/health`. |
| **Settlement worker** | embedded in the API (free tier) **or** a dedicated `type: worker` (paid) | See "Worker modes" below. |

Migrations are applied automatically on every API deploy by
[`apps/api/start-api.sh`](../apps/api/start-api.sh), which runs
`npm run db:deploy` (`prisma migrate deploy`) **before** the server binds its
port.

---

## 2. Deploy on Render (Blueprint)

1. Push the branch you want to deploy.
2. Render Dashboard → **New → Blueprint** → pick this repo/branch. Render reads
   `render.yaml` and creates Postgres, Redis, and the API service.
3. Set the dashboard-only secrets (marked `sync: false` in `render.yaml`), e.g.
   `SUPABASE_SERVICE_ROLE_KEY`, `SPORTS_API_PROVIDER` + `SPORTS_API_KEY`,
   `WEB_APP_URL`, and `CORS_ORIGINS`. Generated values (`JWT_SECRET`,
   `PICK_HASH_PEPPER`) are created automatically.
4. Deploy. On boot the API runs `prisma migrate deploy`, then starts.
5. After the web app is live (OB-102), set `CORS_ORIGINS` to the Vercel domain
   and redeploy.

The API is served over public HTTPS at `https://<service>.onrender.com`.

### Worker modes

- **Free tier (default):** the API runs settlement embedded
  (`EMBED_WORKER=true`, `WORKER_MODE=interval`) — no separate paid worker
  instance and no Redis dependency for grading.
- **Paid tier:** set the API's `EMBED_WORKER=false` and `WORKER_MODE=queue`,
  then uncomment the `overlay-worker` (`type: worker`) service in `render.yaml`
  and pick a paid `plan`. The worker runs `node apps/api/dist/worker.js` and
  shares Postgres + Redis with the API.

---

## 3. Migrations

`prisma migrate deploy` is idempotent and applies only pending migrations, so it
is safe to run on every deploy. It runs automatically via `start-api.sh`. To run
it manually against a database:

```bash
DATABASE_URL=postgres://... npm run db:deploy
```

See [PROD-READINESS-BACKLOG.md](PROD-READINESS-BACKLOG.md) OB-105 for the
prod-safe migration strategy.

---

## 4. Smoke test (acceptance)

After a deploy, confirm the public HTTPS API is up, Postgres + Redis are wired
(migrations applied), and a public endpoint returns data:

```bash
SMOKE_BASE_URL=https://<service>.onrender.com npm run smoke:prod
```

[`scripts/prod-smoke.ts`](../scripts/prod-smoke.ts) checks:

1. `GET /api/health` → `200 { status: "ok" }` (liveness).
2. `GET /api/health/ready` → `200` (readiness — proves Postgres + Redis are
   reachable).
3. `GET /api/leaderboard` → `200` JSON array (a public, unauthenticated
   endpoint).

It exits non-zero on the first failed check, so it can gate a CD pipeline.
`SMOKE_BASE_URL` falls back to `PUBLIC_API_URL`, then `NEXT_PUBLIC_API_URL`,
then `http://localhost:4000` for a local run.

---

## 5. Acceptance criteria checklist

- [ ] Public HTTPS API reachable (`/api/health` → 200).
- [ ] Worker running (embedded or dedicated) — settlement processes picks.
- [ ] Migrations applied (`/api/health/ready` → 200).
- [ ] `npm run smoke:prod` passes against the deployed URL.
