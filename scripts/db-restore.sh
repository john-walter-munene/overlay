#!/usr/bin/env bash
#
# db-restore.sh — restore a pg_dump backup into a target Postgres database.
#
# Restores an archive produced by scripts/db-backup.sh (pg_dump -Fc) into the
# database named in the target connection string. The target database must
# already exist and should be empty (use --clean to drop existing objects
# first). This is the exact command an operator runs during a real recovery —
# see docs/DR-RUNBOOK.md.
#
# Usage:
#   scripts/db-restore.sh BACKUP_FILE [TARGET_DATABASE_URL]
#
# Environment:
#   TARGET_DATABASE_URL  Where to restore (falls back to $DATABASE_URL, or the
#                        2nd argument). Required.
#   RESTORE_JOBS         Parallel restore workers (default: 1).
#   RESTORE_CLEAN        If "1", drop existing objects before restoring.
set -euo pipefail

BACKUP_FILE="${1:-}"
TARGET="${2:-${TARGET_DATABASE_URL:-${DATABASE_URL:-}}}"

if [ -z "$BACKUP_FILE" ]; then
  echo "db-restore: usage: db-restore.sh BACKUP_FILE [TARGET_DATABASE_URL]" >&2
  exit 1
fi
if [ ! -f "$BACKUP_FILE" ]; then
  echo "db-restore: backup file not found: $BACKUP_FILE" >&2
  exit 1
fi
if [ -z "$TARGET" ]; then
  echo "db-restore: no target — set TARGET_DATABASE_URL or DATABASE_URL, or pass it as arg 2" >&2
  exit 1
fi
if ! command -v pg_restore >/dev/null 2>&1; then
  echo "db-restore: pg_restore not found (install the postgresql-client package)" >&2
  exit 1
fi

JOBS="${RESTORE_JOBS:-1}"
CLEAN_ARGS=()
if [ "${RESTORE_CLEAN:-0}" = "1" ]; then
  CLEAN_ARGS=(--clean --if-exists)
fi

# Strip Prisma's connection-only ?schema=... param that libpq CLI tools reject.
sanitize_url() {
  printf '%s' "$1" | sed -E 's/([?&])schema=[^&]*/\1/; s/[?&]$//; s/\?&/?/'
}
CONN="$(sanitize_url "$TARGET")"

echo "db-restore: restoring $BACKUP_FILE into target database"
# --no-owner / --no-privileges: restore objects as the connecting role rather
# than the (possibly non-existent) original owner. --exit-on-error so a failed
# restore is a hard failure the caller can detect.
pg_restore \
  --no-owner --no-privileges \
  --jobs="$JOBS" \
  --exit-on-error \
  "${CLEAN_ARGS[@]}" \
  --dbname="$CONN" \
  "$BACKUP_FILE"

echo "db-restore: restore complete"
