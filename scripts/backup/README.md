# Database backup & restore (SP-10 / R6)

Backup, retention, and a verified restore rehearsal for the single `exprsn`
Postgres database (one DB, one schema per module). Postgres runs in the
`exprsn-postgres` Docker container, so these scripts operate through it and need
no host `pg_dump`/`pg_restore`.

## Commands

```bash
npm run db:backup     # → backups/exprsn-<UTC-timestamp>.dump (custom format, verified)
npm run db:restore    # restore newest dump into a scratch DB, verify, drop it
```

Both read `DB_NAME`/`DB_USER`/`DB_PASSWORD` from the environment (defaults match
`.env`). Pass `DB_PASSWORD=… npm run db:backup` if your shell doesn't export it.

### Backup (`pg-backup.sh`)
- `pg_dump -Fc --no-owner` (custom format → compressed, supports selective +
  parallel restore).
- Verifies each archive immediately with `pg_restore --list` (a corrupt dump
  fails the run).
- Retention: keeps the newest `BACKUP_RETENTION` dumps (default **7**), prunes
  the rest.
- Output + restore logs land in `backups/` (git-ignored).

### Restore rehearsal (`pg-restore.sh [dumpfile] [target_db]`)
- Restores into a **scratch** DB (default `exprsn_restore_check`) — it **refuses**
  to write over the live DB unless `FORCE_OVERWRITE=yes`.
- Verifies by comparing the restored table inventory against the live DB
  (per-schema counts printed; run fails on mismatch or empty restore).
- Drops the scratch DB on success; set `KEEP_RESTORE=yes` to keep it for
  inspection.

Last verified rehearsal: **119 tables** across 12 schemas (atproto, auth, ca,
filevault, live, moderator, nexus, prefetch, public, spark, timeline, vault)
restored cleanly with zero `pg_restore` errors.

## Scheduling

Run nightly via cron on the host (or a sidecar container in staging):

```cron
0 3 * * *  cd /Volumes/Storage/exprsn-platform && DB_PASSWORD=… scripts/backup/pg-backup.sh >> backups/backup.log 2>&1
```

In a managed/staging environment, source `DB_PASSWORD` from the secret store
(see SP-3) rather than inlining it, and ship the `backups/` directory (or the
dumps) to off-host/object storage so a host loss doesn't take the backups with it.

## RPO / RTO (MVP, single instance)

- **RPO ≈ 24h** with the nightly schedule above (worst case: lose up to one day
  of writes). Tighten by running `db:backup` more often (e.g. every 6h) or, post-
  MVP, by adding WAL archiving / PITR.
- **RTO:** restore wall-clock is dominated by `pg_restore` of the ~150 MB archive
  (a few minutes locally). The documented recovery path is: provision Postgres →
  `pg-restore.sh <dump> <db> ` with `FORCE_OVERWRITE`/a fresh DB → repoint the
  app.

## Not covered (post-MVP)

- WAL archiving / point-in-time recovery (only logical daily snapshots here).
- Redis persistence: Redis already runs with `appendonly yes` (AOF) on the
  `redis_data` volume; it holds sessions/queues/cache (rebuildable), not the
  system of record, so it is intentionally out of scope for DB backup/restore.
- Off-host replication of the dumps (wire up in staging per the note above).
