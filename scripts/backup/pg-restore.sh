#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# pg-restore.sh — restore a backup into a SCRATCH DB and verify (SP-10 rehearsal)
#
# Restores a pg_dump archive into a throwaway database (default
# `<db>_restore_check`) and verifies it by comparing the table inventory against
# the live DB. It REFUSES to write over the live DB unless FORCE_OVERWRITE=yes.
#
# Usage:   scripts/backup/pg-restore.sh [dumpfile] [target_db]
#            dumpfile  - defaults to the newest ./backups/<db>-*.dump
#            target_db - defaults to <db>_restore_check
# Env:     DB_NAME DB_USER DB_PASSWORD PG_CONTAINER BACKUP_DIR
#          KEEP_RESTORE=yes  - keep the scratch DB after verifying (default: drop)
#          FORCE_OVERWRITE=yes - allow target_db == live DB (dangerous)
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

DB_NAME="${DB_NAME:-exprsn}"
DB_USER="${DB_USER:-exprsn}"
DB_PASSWORD="${DB_PASSWORD:-change_me}"
PG_CONTAINER="${PG_CONTAINER:-exprsn-postgres}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
DUMP="${1:-}"
TARGET_DB="${2:-${TARGET_DB:-${DB_NAME}_restore_check}}"

if [ -z "$DUMP" ]; then
  DUMP="$(ls -1t "$BACKUP_DIR/${DB_NAME}-"*.dump 2>/dev/null | head -n1 || true)"
fi
if [ -z "$DUMP" ] || [ ! -f "$DUMP" ]; then
  echo "[restore] ERROR: no dump file given and none found in $BACKUP_DIR" >&2
  exit 1
fi
if [ "$TARGET_DB" = "$DB_NAME" ] && [ "${FORCE_OVERWRITE:-}" != "yes" ]; then
  echo "[restore] ERROR: refusing to restore over live DB '$DB_NAME' (set FORCE_OVERWRITE=yes)" >&2
  exit 1
fi

# Helper: run psql inside the container against $1, remaining args passed through.
pg_psql() {
  local db="$1"; shift
  docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$PG_CONTAINER" psql -U "$DB_USER" -d "$db" "$@"
}

echo "[restore] dump:    $DUMP"
echo "[restore] target:  $TARGET_DB (scratch)"

# (Re)create the scratch DB from a clean slate.
pg_psql postgres -v ON_ERROR_STOP=1 -q -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";"
pg_psql postgres -v ON_ERROR_STOP=1 -q -c "CREATE DATABASE \"$TARGET_DB\" OWNER \"$DB_USER\";"

restore_log="$BACKUP_DIR/restore-$(date -u +%Y%m%dT%H%M%SZ).log"
echo "[restore] restoring (benign extension/owner notices → $restore_log)..."
# No -e: keep going past benign notices (e.g. PostGIS extension already-present).
# Errors that matter surface in the table-count verification below.
docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$PG_CONTAINER" \
  pg_restore -U "$DB_USER" -d "$TARGET_DB" --no-owner --no-privileges < "$DUMP" 2> "$restore_log" || true

# ── Verify: table inventory of the restored DB must match the live DB ────────
count_sql="SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema');"
src_total="$(pg_psql "$DB_NAME" -At -c "$count_sql" | tr -d '[:space:]')"
dst_total="$(pg_psql "$TARGET_DB" -At -c "$count_sql" | tr -d '[:space:]')"

echo "[restore] per-schema table counts in '$TARGET_DB':"
pg_psql "$TARGET_DB" -c "
  SELECT table_schema AS schema, count(*) AS tables
  FROM information_schema.tables
  WHERE table_schema NOT IN ('pg_catalog','information_schema')
  GROUP BY table_schema ORDER BY table_schema;"

echo "[restore] table inventory: live=$src_total  restored=$dst_total"

status=0
if [ -z "$dst_total" ] || [ "$dst_total" -eq 0 ]; then
  echo "[restore] FAIL: restored DB has no tables." >&2
  status=1
elif [ "$dst_total" != "$src_total" ]; then
  echo "[restore] FAIL: table count mismatch (live=$src_total restored=$dst_total)." >&2
  status=1
else
  echo "[restore] PASS: restored table inventory matches the live DB."
fi

if [ "${KEEP_RESTORE:-}" = "yes" ]; then
  echo "[restore] keeping scratch DB '$TARGET_DB' (KEEP_RESTORE=yes)."
else
  pg_psql postgres -q -c "DROP DATABASE IF EXISTS \"$TARGET_DB\";" >/dev/null
  echo "[restore] dropped scratch DB '$TARGET_DB'."
fi

exit "$status"
