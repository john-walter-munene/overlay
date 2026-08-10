#!/usr/bin/env bash
#
# db-backup.sh — take a compressed logical backup of the Overlay Postgres DB.
#
# Produces a timestamped pg_dump custom-format archive (-Fc) that can be
# restored selectively and in parallel with pg_restore. Old backups beyond the
# retention window are pruned so a scheduled job doesn't fill the disk.
#
# Usage:
#   DATABASE_URL=******host:5432/db scripts/db-backup.sh [OUT_DIR]
#
# Environment:
#   DATABASE_URL        Postgres connection string (required).
#   BACKUP_DIR          Output directory (default: ./backups, or OUT_DIR arg).
#   BACKUP_RETENTION    Number of most-recent backups to keep (default: 14).
#
# Output:
#   $BACKUP_DIR/overlay-YYYYmmddTHHMMSSZ.dump  (the backup)
#   Prints the path of the backup it wrote on success.
#
# Restore a backup produced here with scripts/db-restore.sh. See
# docs/DR-RUNBOOK.md for the full disaster-recovery procedure.
set -euo pipefail

if [ -z "${DATABASE_URL:-}" ]; then
  echo "db-backup: DATABASE_URL is not set" >&2
  exit 1
fi

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "db-backup: pg_dump not found (install the postgresql-client package)" >&2
  exit 1
fi

# Strip Prisma's connection-only ?schema=... param, which libpq CLI tools
# (pg_dump/pg_restore/psql) reject as an "invalid connection option". Other
# params (e.g. sslmode) are preserved.
sanitize_url() {
  printf '%s' "$1" | sed -E 's/([?&])schema=[^&]*/\1/; s/[?&]$//; s/\?&/?/'
}
CONN="$(sanitize_url "$DATABASE_URL")"

BACKUP_DIR="${1:-${BACKUP_DIR:-./backups}}"
RETENTION="${BACKUP_RETENTION:-14}"

mkdir -p "$BACKUP_DIR"

# UTC, sortable, filesystem-safe timestamp so listings sort chronologically.
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_DIR/overlay-$STAMP.dump"

echo "db-backup: dumping database to $OUT"
# -Fc  custom format (compressed, selective/parallel restore)
# --no-owner / --no-privileges keep the dump portable across roles so it
# restores cleanly into a scratch DB owned by a different user (drill).
pg_dump --format=custom --no-owner --no-privileges --file="$OUT" "$CONN"

BYTES="$(wc -c <"$OUT" | tr -d '[:space:]')"
echo "db-backup: wrote $OUT ($BYTES bytes)"

# Retention: keep the newest $RETENTION *.dump files, delete the rest.
if [ "$RETENTION" -gt 0 ]; then
  # List newest-first, skip the ones we keep, remove the tail.
  # shellcheck disable=SC2012  # backup filenames are controlled (no newlines).
  ls -1t "$BACKUP_DIR"/overlay-*.dump 2>/dev/null | tail -n +"$((RETENTION + 1))" | while read -r old; do
    echo "db-backup: pruning old backup $old"
    rm -f "$old"
  done
fi

# Emit just the path on the last line for scripting/CI capture.
echo "$OUT"
