# Test-data seeder

Generates large volumes of **realistic** test data directly in the live
`exprsn` database for load/scale testing. Everything it creates is marked so it
never collides with real data and can be removed in one command.

## What it creates

| Quantity (default) | What | Marker |
|---|---|---|
| `ORGS` = 100 | organizations, each with full `settings` | slug `seed-org-NNN`, `settings.seed=true` |
| `ORGS` × `USERS_PER_ORG` = 10 000 | users (+ membership + org-member role), full settings in `metadata` | email `seed-oNNN-uNNN@seed.test`, `metadata.seed=true` |
| 100 | **root** CA certificates (1 per org, RSA-4096) | CN `Seed Root CA …`, `organization` `Seed Org …` |
| 100 | **intermediate** CA certs (1 per org, signed by the org root) | CN `Seed Intermediate CA …` |
| 10 000 | **entity** certs (1 per user, RSA-2048, signed by the org intermediate; types cycle client/server/code_signing) | `organization` `Seed Org …` |
| `USERS_PER_ORG` × `TOKENS_PER_USER` × `ORGS` = 1 000 000 | CA tokens (1 user → signed by that user's entity cert) | `metadata.seed=true` |

All certificates are genuinely generated with node-forge (real keypairs, real
signing chains; private keys stored under `data/ca/keys/`). All tokens carry a
real RSA-SHA256-PSS signature computed exactly like
`services/ca/services/token.js`, so they pass `tokenService.validateToken`.

Every seed user shares one password, provided via the **required** env var
`SEED_PASSWORD` (no default is shipped — `seed-main.js` fails fast with a
clear error if it's unset) — one bcrypt hash is computed once and reused so
creating 10 000 users is fast.

All scripts in this directory refuse to run when `NODE_ENV=production`.

## Run

```bash
# full run (writes to the live exprsn DB; reads creds from repo-root .env)
SEED_PASSWORD='<choose-a-dev-password>' node scripts/seed/seed-main.js

# tune volume / parallelism
SEED_PASSWORD='<choose-a-dev-password>' \
  ORGS=100 USERS_PER_ORG=100 TOKENS_PER_USER=100 CONCURRENCY=10 \
  node scripts/seed/seed-main.js

# quick smoke run
SEED_PASSWORD='<choose-a-dev-password>' \
  ORGS=2 USERS_PER_ORG=3 TOKENS_PER_USER=5 node scripts/seed/seed-main.js
```

Env vars: `ORGS`, `USERS_PER_ORG`, `TOKENS_PER_USER`, `CONCURRENCY`
(default = CPUs−2, capped 10), `SEED_PASSWORD` (required), `SEED_SCRATCH`
(manifest + work files; default `$TMPDIR/exprsn-seed-work`).

## Idempotent / resumable

Identities are deterministic and a manifest under `SEED_SCRATCH` records
progress. Re-running tops up only what's missing (skips existing users,
certs-per-user, and counts existing tokens per user). Delete the scratch dir to
force a full regeneration of certs/tokens.

## Verify / reset

```bash
node scripts/seed/verify.js   # validates a seed token + prints org/user settings
node scripts/seed/reset.js    # deletes ALL seed data (real data untouched)
```

## Implementation notes

- The crypto work is CPU-bound (node-forge). The orchestrator (`seed-main.js`)
  does the cheap auth-schema work in-process, then fans the certificate and
  token phases out to `CONCURRENCY` forked workers (`cert-worker.js`,
  `token-worker.js`). DB pools are capped (`DB_POOL_MAX=4` per worker) so the
  workers stay well under Postgres `max_connections`.
- BIGINT columns (`issuedAt`/`notBefore`/`expiresAt`) read back from Postgres as
  **strings**; token signatures are computed over the string form so
  `validateToken` (which reconstructs from the DB) verifies them.
