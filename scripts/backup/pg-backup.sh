#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════
# pg-backup.sh — logical backup of the single `exprsn` Postgres DB (SP-10 / R6)
#
# Produces a compressed custom-format dump (pg_dump -Fc) — which supports
# selective + parallel restore — verifies the archive is readable, and prunes to
# a retention window. Operates through the `exprsn-postgres` container by default
# (Postgres runs in Docker), so it needs no host pg_dump.
#
# Usage:   scripts/backup/pg-backup.sh
# Env:     DB_NAME DB_USER DB_PASSWORD (defaults match .env), PG_CONTAINER,
#          BACKUP_DIR (default ./backups), BACKUP_RETENTION (default 7)
# Cron:    0 3 * * *  cd /Volumes/Storage/exprsn-platform && scripts/backup/pg-backup.sh >> backups/backup.log 2>&1
# ═══════════════════════════════════════════════════════════════════════════
set -euo pipefail

DB_NAME="${DB_NAME:-exprsn}"
DB_USER="${DB_USER:-exprsn}"
DB_PASSWORD="${DB_PASSWORD:-change_me}"
PG_CONTAINER="${PG_CONTAINER:-exprsn-postgres}"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION="${BACKUP_RETENTION:-7}"

mkdir -p "$BACKUP_DIR"
ts="$(date -u +%Y%m%dT%H%M%SZ)"
out="$BACKUP_DIR/${DB_NAME}-${ts}.dump"

if ! docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  echo "[backup] ERROR: container '$PG_CONTAINER' is not running" >&2
  exit 1
fi

echo "[backup] dumping '$DB_NAME' from '$PG_CONTAINER' → $out"
docker exec -e PGPASSWORD="$DB_PASSWORD" "$PG_CONTAINER" \
  pg_dump -U "$DB_USER" -d "$DB_NAME" -Fc --no-owner > "$out"

# Integrity check: the table-of-contents must parse, else the archive is junk.
docker exec -i "$PG_CONTAINER" pg_restore --list < "$out" > /dev/null
size="$(du -h "$out" | cut -f1)"
echo "[backup] OK ($size) — archive verified with 'pg_restore --list'."

# Retention: delete everything older than the newest $RETENTION dumps.
ls -1t "$BACKUP_DIR/${DB_NAME}-"*.dump 2>/dev/null | tail -n +$((RETENTION + 1)) | while IFS= read -r f; do
  echo "[backup] pruning old archive: $f"
  rm -f "$f"
done

kept="$(ls -1 "$BACKUP_DIR/${DB_NAME}-"*.dump 2>/dev/null | wc -l | tr -d ' ')"
echo "[backup] done — $kept archive(s) retained in $BACKUP_DIR (retention=$RETENTION)."
