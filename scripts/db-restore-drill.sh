#!/usr/bin/env bash
#
# db-restore-drill.sh — verify that a backup can actually be restored.
#
# Runs the full backup → restore loop end-to-end, without touching the source
# database:
#   1. Take a fresh backup of DATABASE_URL (via db-backup.sh).
#   2. Create a throwaway "scratch" database on the same server.
#   3. Restore the backup into the scratch database (via db-restore.sh).
#   4. Verify the restore: the scratch DB must contain the same user tables and
#      the same total row count as the source.
#   5. Drop the scratch database (unless KEEP_SCRATCH=1).
#
# This is the automated disaster-recovery drill required by OB-094: it proves a
# backup is restorable rather than merely present. It exits non-zero — and is
# therefore CI-failing — if the backup can't be taken, restored, or verified.
#
# Usage:
#   DATABASE_URL=******host:5432/db scripts/db-restore-drill.sh
#
# Environment:
#   DATABASE_URL   Source database to drill (required).
#   SCRATCH_DB     Name of the scratch database (default: overlay_drill_<pid>).
#   KEEP_SCRATCH   If "1", leave the scratch DB behind for inspection.
#   BACKUP_DIR     Where the drill backup is written (default: ./backups).
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "db-restore-drill: DATABASE_URL is not set" >&2
  exit 1
fi
for bin in pg_dump pg_restore psql createdb dropdb; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "db-restore-drill: $bin not found (install the postgresql-client package)" >&2
    exit 1
  fi
done

# --- Parse DATABASE_URL -----------------------------------------------------
# libpq's CLI tools reject Prisma-only query params (e.g. ?schema=public), so
# strip the query string and rebuild clean URLs for the same server. We derive:
#   - the source db name, and
#   - an admin URL pointing at the maintenance `postgres` database (so we can
#     CREATE/DROP the scratch db without connecting to it), and
#   - a scratch URL for the throwaway database.
URL_NO_QUERY="${DATABASE_URL%%\?*}"
BASE="${URL_NO_QUERY%/*}"          # e.g. ******host:5432
SRC_DB="${URL_NO_QUERY##*/}"       # e.g. overlay
SCRATCH="${SCRATCH_DB:-overlay_drill_$$}"

# Preserve any real libpq query params (e.g. sslmode) but drop Prisma's
# connection-only ?schema=... which the CLI tools reject.
QUERY=""
case "$DATABASE_URL" in
  *\?*) QUERY="?${DATABASE_URL#*\?}" ;;
esac
QUERY="$(printf '%s' "$QUERY" | sed -E 's/([?&])schema=[^&]*/\1/; s/[?&]$//; s/\?&/?/')"

SRC_URL="$BASE/$SRC_DB$QUERY"
ADMIN_URL="$BASE/postgres$QUERY"
SCRATCH_URL="$BASE/$SCRATCH$QUERY"

echo "db-restore-drill: source=$SRC_DB scratch=$SCRATCH"

# --- Cleanup on exit --------------------------------------------------------
cleanup() {
  if [ "${KEEP_SCRATCH:-0}" = "1" ]; then
    echo "db-restore-drill: KEEP_SCRATCH=1 — leaving scratch DB $SCRATCH in place"
    return
  fi
  echo "db-restore-drill: dropping scratch DB $SCRATCH"
  dropdb --if-exists --force "$SCRATCH" --maintenance-db="$ADMIN_URL" 2>/dev/null || \
    psql "$ADMIN_URL" -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \"$SCRATCH\"" >/dev/null 2>&1 || true
}
trap cleanup EXIT

# Helper: total number of rows across all user tables in a database.
count_rows() {
  psql "$1" -At -v ON_ERROR_STOP=1 -c "
    SELECT COALESCE(SUM(cnt), 0) FROM (
      SELECT (xpath('/row/c/text()',
        query_to_xml(format('SELECT COUNT(*) AS c FROM %I.%I', schemaname, tablename),
          false, true, '')))[1]::text::bigint AS cnt
      FROM pg_tables
      WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ) s;"
}

# Helper: sorted list of qualified user tables in a database.
list_tables() {
  psql "$1" -At -v ON_ERROR_STOP=1 -c "
    SELECT schemaname || '.' || tablename FROM pg_tables
    WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
    ORDER BY 1;"
}

# --- 1. Backup --------------------------------------------------------------
echo "db-restore-drill: [1/4] backing up source database"
BACKUP_FILE="$(DATABASE_URL="$SRC_URL" bash "$HERE/db-backup.sh" | tail -n 1)"
echo "db-restore-drill: backup at $BACKUP_FILE"

# Snapshot the source shape now so the comparison is against what we backed up.
SRC_TABLES="$(list_tables "$SRC_URL")"
SRC_ROWS="$(count_rows "$SRC_URL")"

# --- 2. Create scratch DB ---------------------------------------------------
echo "db-restore-drill: [2/4] creating scratch database $SCRATCH"
dropdb --if-exists --force "$SCRATCH" --maintenance-db="$ADMIN_URL" 2>/dev/null || true
createdb "$SCRATCH" --maintenance-db="$ADMIN_URL"

# --- 3. Restore -------------------------------------------------------------
echo "db-restore-drill: [3/4] restoring backup into scratch database"
bash "$HERE/db-restore.sh" "$BACKUP_FILE" "$SCRATCH_URL"

# --- 4. Verify --------------------------------------------------------------
echo "db-restore-drill: [4/4] verifying restored data"
DST_TABLES="$(list_tables "$SCRATCH_URL")"
DST_ROWS="$(count_rows "$SCRATCH_URL")"

FAIL=0
if [ "$SRC_TABLES" != "$DST_TABLES" ]; then
  echo "db-restore-drill: FAIL — table set differs after restore" >&2
  echo "--- source tables ---" >&2; echo "$SRC_TABLES" >&2
  echo "--- restored tables ---" >&2; echo "$DST_TABLES" >&2
  FAIL=1
fi
if [ "$SRC_ROWS" != "$DST_ROWS" ]; then
  echo "db-restore-drill: FAIL — row count differs: source=$SRC_ROWS restored=$DST_ROWS" >&2
  FAIL=1
fi

if [ "$FAIL" -ne 0 ]; then
  echo "db-restore-drill: DRILL FAILED" >&2
  exit 1
fi

SRC_TABLE_COUNT="$(printf '%s\n' "$SRC_TABLES" | grep -c . || true)"
echo "db-restore-drill: DRILL PASSED — restored $SRC_TABLE_COUNT tables / $SRC_ROWS rows into scratch DB"
