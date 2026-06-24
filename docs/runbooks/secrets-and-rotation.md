# Secrets & rotation runbook (SP-3 / R4)

How production secrets are sourced, what must be set before a deploy, and how to
rotate each secret. Today all config is environment-based (`src/config/index.js`
loads `.env`); **no secrets are committed** (`.gitignore` covers `.env`, `.env.*`,
`**/.env.*`; only `*.env.example` is tracked). For a real deployment, inject these
vars from a managed source (Docker/Compose secrets, or a cloud secret manager)
rather than a plaintext `.env` on disk.

## Secret inventory

| Secret | Used for | Rotation impact |
|---|---|---|
| `SERVICE_TOKEN_SECRET` | HMAC base for per-service tokens (`shared/utils/serviceToken.js`) | Re-keys **all** service-to-service auth — rolling restart of every process |
| `SESSION_SECRET` | express-session signing (auth, ca) | Invalidates all active login sessions |
| `JWT_SECRET` | JWT signing where used | Invalidates issued JWTs |
| `DB_PASSWORD` | Postgres | Coordinated change in Postgres + env; brief connection blip |
| `REDIS_PASSWORD` | Redis (sessions, queues, cache) | Sessions/cache drop; queues reconnect |
| `ATPROTO_USER_DID_SECRET` | derives every user's `did:exprsn` | **Changing it re-keys every user DID** — avoid; treat as permanent |
| `ATPROTO_SIGNING_KEY` | labeler label signing | Inbound verifiers must re-fetch the new key; coordinate |
| `DEV_BYPASS_SECRET` | dev auth bypass header | Dev-only; irrelevant in prod (bypass is inert — see below) |
| OAuth/SAML (`GOOGLE_*`, `GITHUB_*`) | social login | Re-issue at the provider, update env |
| Email/SMS (`SMTP_PASSWORD`, `SENDGRID_API_KEY`, `MAILGUN_API_KEY`, Twilio) | notifications | Re-issue at provider |
| AI keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, …) | moderation pipeline | Re-issue at provider |
| Cloud (`AWS_*`, `CLOUDFLARE_STREAM_TOKEN`) | storage / streaming | Re-issue at provider |
| Infra (`RABBITMQ_PASSWORD`, `LDAP_ADMIN_PASSWORD`, `KRB5_ADMIN_PASSWORD`) | extras-profile services | Coordinated change with the service |

Generate strong values with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## Production readiness checklist (before deploy)

- [ ] `NODE_ENV=production` (this alone makes `DEV_BYPASS` inert — see below).
- [ ] Every secret above set to a strong value — **no `change_me` / empty
      placeholders**. `SERVICE_TOKEN_SECRET` and `SESSION_SECRET` ≥ 32 chars.
- [ ] `DB_SSL=true` (defaults to `false`; verify the server cert per
      `DB_SSL_REJECT_UNAUTHORIZED` / `DB_SSL_CA`).
- [ ] `DEV_BYPASS` unset or `false`; `DEV_BYPASS_SECRET` unset.
- [ ] `REDIS_PASSWORD` set (the container enables auth only when it is).
- [ ] `CORS_ORIGIN` set to the real allowlist (unset/`*` = same-origin only; a
      wildcard is never paired with credentials — `src/gateway.js`).
- [ ] Secrets injected from the manager, not a disk `.env` baked into the image.

## Rotation procedures

**`SERVICE_TOKEN_SECRET` (highest blast radius).** Per-service tokens are
`HMAC-SHA256(serviceId, SERVICE_TOKEN_SECRET)`, so rotating invalidates every
service token at once. Single-process today, so: update the secret in the manager →
restart the platform process (and the workers: `worker:timeline`,
`worker:prefetch`, `worker:atproto`). If a legacy static `SERVICE_TOKEN` is still
in play, the `SERVICE_TOKEN_LEGACY_ALLOW=true` window lets old+new coexist during
migration — disable it once done.

**`SESSION_SECRET`.** Update in the manager → restart. All users are logged out
(expected). To avoid a hard cutover, support a secret array (current + previous)
if/when the session layer is extended; today it is a single value, so a restart is
the rotation.

**`DB_PASSWORD` / `REDIS_PASSWORD`.** Change the credential in Postgres/Redis and
the env in the same window, then restart so pools reconnect. Take a backup first
(`npm run db:backup`).

**Provider keys (OAuth/SAML/email/SMS/AI/cloud).** Rotate at the provider, update
the env, restart. These are independent — no platform-wide impact.

**`ATPROTO_USER_DID_SECRET`.** Effectively permanent: it derives every user's
`did:exprsn`. Do **not** rotate without a DID-migration plan.

## DEV_BYPASS is fail-closed (proof)

The dev auth bypass injects an admin identity, so it must be impossible in prod.
It is gated in `shared/middleware/devBypass.js` (`bypassConfigured()`), which
requires **all** of: `NODE_ENV==='development'`, `DEV_BYPASS==='true'`,
`DEV_BYPASS_SECRET` ≥ 32 chars, a matching `x-dev-bypass-secret` header
(constant-time compare), **and** a loopback origin. The `NODE_ENV==='development'`
check fails first in any other environment, so production is inert regardless of
headers/secret/origin.

Regression-locked by `shared/tests/devBypass.test.js` (run: `cd shared && npx
jest tests/devBypass.test.js`), which asserts prod/staging/test/undefined are all
inert even with a valid secret + loopback + header, and that `bypassCA`/
`bypassAuth` inject nothing in production.

## Not covered (deploy-time)

- The actual managed secret store wiring (Docker/Compose secrets vs cloud manager)
  depends on the chosen deploy target.
- Automated/scheduled rotation; today rotation is the manual procedure above.
