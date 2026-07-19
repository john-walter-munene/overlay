# Disaster Recovery Runbook (OB-094)

How Overlay Bets backs up its Postgres database, how we prove those backups are
restorable, and how to recover when the database is lost or corrupted.

- **Scope:** the Postgres database (the source of truth). Redis is a disposable
  BullMQ backend — settlement re-queues from Postgres and needs no backup.
- **Owner:** whoever is on-call for ops.
- **Related:** [OBSERVABILITY.md](./OBSERVABILITY.md) (health/metrics),
  [`render.yaml`](../render.yaml) (managed Postgres), OB-095 (incident process).

## Objectives

| Metric | Target | Notes |
| --- | --- | --- |
| **RPO** (max data loss) | ≤ 24h | Nightly logical backup (03:00 UTC). Tighten with PITR (see below) if the risk warrants it. |
| **RTO** (time to restore) | ≤ 1h | Restore a nightly dump into a fresh database and repoint the app. |

## Backup strategy

Two independent layers so a single failure never leaves us without a backup:

1. **Provider snapshots.** The managed Postgres (Render) keeps its own
   daily snapshots per its plan. These cover host/volume loss.
2. **Portable logical backups (this repo).** A scheduled GitHub Actions job,
   [`.github/workflows/db-backup.yml`](../.github/workflows/db-backup.yml), runs
   `pg_dump` (custom format, compressed) every night and retains the archive as
   a workflow artifact. These are portable — they restore onto **any** Postgres
   16 host, not just the current provider — which matters for a full-provider
   outage or migration.

   Enable it by setting the repository secret `PROD_DATABASE_URL` to the
   production connection string. Without the secret the job no-ops (it does not
   fail). Trigger an ad-hoc backup from the Actions tab ("Run workflow").

### Tooling

All backup/restore logic lives in `scripts/` so it runs identically locally, in
CI, and during a real recovery. Each reads `DATABASE_URL` and strips Prisma's
connection-only `?schema=` param that the `libpq` CLI tools reject.

| Script | npm script | Purpose |
| --- | --- | --- |
| [`scripts/db-backup.sh`](../scripts/db-backup.sh) | `npm run db:backup` | Write a timestamped `pg_dump -Fc` archive; prune beyond `BACKUP_RETENTION` (default 14). |
| [`scripts/db-restore.sh`](../scripts/db-restore.sh) | `npm run db:restore` | Restore an archive into a target database. |
| [`scripts/db-restore-drill.sh`](../scripts/db-restore-drill.sh) | `npm run db:restore-drill` | Backup → restore into a scratch DB → verify tables + row counts match → drop scratch. |

## Restore drill (verifying backups)

A backup is worthless until a restore has been verified. The drill proves the
full backup → restore loop end-to-end without touching the source database, and
fails loudly (non-zero exit) if the backup can't be taken, restored, or verified.

- **Automated:** [`.github/workflows/db-restore-drill.yml`](../.github/workflows/db-restore-drill.yml)
  spins up an ephemeral Postgres 16, applies the real Prisma migrations + seed,
  and runs the drill. It runs weekly (Mondays 04:17 UTC), on changes to the
  backup tooling, and on demand. A red run means our backups are not restorable
  — treat it as a P0.
- **Manual (against any database):**

  ```bash
  # Restores a fresh backup of $DATABASE_URL into a throwaway scratch DB,
  # verifies it, then drops the scratch DB. Never mutates the source.
  DATABASE_URL="postgres://…" npm run db:restore-drill
  ```

  The drill passes when the scratch DB has the **same user tables and the same
  total row count** as the source. Set `KEEP_SCRATCH=1` to leave the scratch DB
  behind for inspection.

### Drill result log

Record each verified drill here (the automated workflow is the ongoing record;
add notable manual drills too).

| Date (UTC) | Source | Tables / rows restored | Result | By |
| --- | --- | --- | --- | --- |
| 2026-07-19 | Ephemeral CI Postgres (migrations + seed) | verified via `db:restore-drill` | ✅ pass | OB-094 |

## Recovery procedures

Prerequisites: the Postgres 16 client tools (`pg_dump`, `pg_restore`, `psql`)
and the backup archive (download the latest `overlay-db-backup-*` artifact from
the `DB backup` workflow, or take a provider snapshot).

### A. Restore into a new/empty database

1. Provision a fresh Postgres 16 database and note its connection string.
2. Apply the backup:

   ```bash
   npm run db:restore -- ./backups/overlay-YYYYmmddTHHMMSSZ.dump "postgres://…/new_db"
   ```

3. Sanity-check row counts, then run `npm run db:deploy` so the schema is at the
   latest migration.
4. Repoint the app: update `DATABASE_URL` (Render: the database's
   `connectionString`) and redeploy the API + worker.
5. Verify `GET /api/health/ready` returns `200` and settlement resumes.

### B. Roll back a corrupted database in place

1. **Stop writes** — scale the API + worker to zero so nothing writes during the
   restore.
2. Restore over the existing database, dropping conflicting objects first:

   ```bash
   RESTORE_CLEAN=1 npm run db:restore -- ./backups/<archive>.dump "$DATABASE_URL"
   ```

3. Run `npm run db:deploy`, bring the services back up, and verify readiness.

### C. Full provider outage

1. Provision Postgres 16 with a different provider.
2. Follow **A** using the latest portable logical backup (the `pg_dump`
   artifact) — it is provider-independent.
3. Update DNS/config to the new endpoints and redeploy.

## Point-in-time recovery (future)

Nightly logical backups cap data loss at ~24h. If that RPO becomes too high,
enable continuous WAL archiving / PITR on the managed Postgres (or a service
such as WAL-G) to recover to a specific moment. Tracked as a follow-up; the
logical backups above remain the portable, provider-independent floor.

## Checklist

- [x] Scheduled backups — nightly `pg_dump` artifact (`db-backup.yml`) + provider snapshots.
- [x] Restore verified — automated drill (`db-restore-drill.yml`) + `npm run db:restore-drill`.
- [x] Runbook exists — this document.
