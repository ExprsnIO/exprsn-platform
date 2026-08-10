# Exprsn-CA — Certificate Authority & Token Service

> **Service:** `@exprsn/ca` · **Port:** `3000` (HTTPS) / `3009` (HTTP redirect) · **OCSP Port:** `2560`
> **Status:** Production · **Priority:** Critical — **must start before every other service**

The **Exprsn Certificate Authority (Exprsn-CA)** is the cryptographic root of trust for the
entire Exprsn platform. It is a full X.509 Certificate Authority combined with a bespoke
**CA Token** authorization system that secures service-to-service and user-to-resource
communication across all microservices.

Because every other service relies on it for certificate validation and token verification,
**Exprsn-CA must be started first**. If it is unavailable, dependent services cannot mint or
validate the capability tokens they use to talk to one another.

---

## Table of Contents

1. [Responsibilities](#responsibilities)
2. [Architecture](#architecture)
3. [Technology Stack](#technology-stack)
4. [Directory Layout](#directory-layout)
5. [Configuration](#configuration)
6. [Data Model](#data-model)
7. [CA Token System](#ca-token-system)
8. [Certificate Management](#certificate-management)
9. [OCSP Responder](#ocsp-responder)
10. [Certificate Revocation List (CRL)](#certificate-revocation-list-crl)
11. [Cryptography](#cryptography)
12. [Storage Layer](#storage-layer)
13. [Authentication, Sessions & Middleware](#authentication-sessions--middleware)
14. [Inter-Service Communication (IPC)](#inter-service-communication-ipc)
15. [HTTP API Reference](#http-api-reference)
16. [Web UI Routes](#web-ui-routes)
17. [First-Run Setup Wizard](#first-run-setup-wizard)
18. [Running the Service](#running-the-service)
19. [Security Considerations](#security-considerations)
20. [Troubleshooting](#troubleshooting)

---

## Responsibilities

| Capability | Description |
|------------|-------------|
| **X.509 Certificate Authority** | Issues and manages root, intermediate, and end-entity certificates (client, server, code-signing, SAN). |
| **CA Token authorization** | Mints cryptographically signed capability tokens that bind permissions to a specific resource with flexible expiry. |
| **OCSP responder** | Real-time certificate-status checks (RFC 6960 style) on a dedicated port with caching. |
| **CRL distribution** | Generates and serves Certificate Revocation Lists in PEM and DER form. |
| **Identity & RBAC** | Users, groups, roles, and bitmask permissions with audit logging. |
| **Token rotation** | Optional scheduled rotation of expiring tokens. |
| **Setup wizard** | First-run, browser-based bootstrap of the CA, admin user, databases, and storage. |

---

## Architecture

Exprsn-CA is an Express application that boots an HTTPS server (managed by the shared
`HTTPSServerManager`) and layers Socket.IO and an IPC worker on top of it.

```
                         ┌──────────────────────────────────────────────┐
                         │              exprsn-ca process               │
                         │                                              │
  HTTPS :3000 ───────────▶  Express app (EJS UI + JSON API)             │
  HTTP  :3009 (redirect) │   ├── helmet / CORS / compression           │
                         │   ├── express-session (PostgreSQL store)     │
                         │   ├── routes: /, /auth, /ca, /certificates,  │
                         │   │           /tokens, /users, /groups,      │
                         │   │           /roles, /tickets, /ocsp, /crl, │
                         │   │           /api, /admin, /setup           │
                         │   └── Socket.IO (real-time dashboard)        │
                         │                                              │
  OCSP  :2560 ───────────▶  OCSP responder                             │
                         │                                              │
  IPC (Redis namespace) ─▶  IPCWorker  ── cert:validate / token:validate│
                         │                                              │
                         │   crypto (node-forge)   storage (disk/s3/db) │
                         └───────────────┬──────────────────────────────┘
                                         │
                          ┌──────────────┴──────────────┐
                          │                              │
                    PostgreSQL (exprsn_ca)          Redis cache
                    certs, tokens, users,           token/cert/OCSP
                    roles, audit logs, sessions      response caching
```

Key startup behaviours (`src/exprsn-ca/index.js`):

- **Setup gate** — if setup is not complete, the app runs in *setup mode* and only serves the
  `/setup` wizard; full initialization is skipped.
- **Auto-generated Root CA** — on first complete boot, if no active `root` certificate exists,
  a 4096-bit self-signed root CA (20-year validity) is generated and persisted automatically.
- **Graceful shutdown** — `SIGTERM`/`SIGINT` disconnect IPC, close the HTTP server, and close
  the Sequelize connection before exiting.
- **Dev bypass** — a shared `bypassAll` middleware can short-circuit auth in development
  (logged on startup); it is mounted *before* auth middleware.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js `>=18`, npm `>=9` |
| Web framework | Express 4 |
| Views | EJS + `express-ejs-layouts` |
| ORM / DB | Sequelize 6 + PostgreSQL (`pg`) |
| Cache | Redis (`redis` / `ioredis`) |
| Sessions | `express-session` + `connect-pg-simple` (PostgreSQL-backed) |
| Crypto | `node-forge` (X.509, RSA, PSS), Node `crypto` |
| Realtime | Socket.IO 4 |
| Security | `helmet`, `cors`, `express-rate-limit`, `bcrypt` |
| Validation | `joi` |
| MFA / QR | `speakeasy`, `qrcode` |
| Email | `nodemailer` |
| Logging | `winston` + `morgan` |
| Uploads | `multer` |

---

## Directory Layout

```
src/exprsn-ca/
├── index.js                 # App bootstrap, HTTPS server, Socket.IO, IPC, root-CA auto-gen
├── cluster.js               # Cluster-mode entry point
├── config/                  # Modular config (app, ca, database, cache, jwt, ocsp, crl, …)
├── controllers/             # auth, authV2, certificate, token, user controllers
├── crypto/index.js          # node-forge cryptography (keygen, cert gen, sign/verify, PSS)
├── middleware/              # auth, rateLimit, permissionCache, setupCheck, socketAuth, validation
├── migrations/              # Sequelize migrations (13 tables)
├── models/                  # Sequelize models (User, Certificate, Token, Role, …)
├── routes/                  # Express route modules (API + EJS views)
├── services/                # token, certificate, crl, ocsp, setup, socket, email, tokenRotation
├── storage/                 # Pluggable storage (disk, s3, database) + index dispatcher
├── utils/                   # logger (winston), redis client
├── validators/              # Joi schemas per domain
├── views/                   # EJS templates (dashboard, admin, setup wizard, auth, …)
├── public/                  # Static CSS/JS assets
└── scripts/setup.js         # CLI setup helper
```

---

## Configuration

Configuration is **modular** (`config/index.js` aggregates one module per concern) and loaded
from the project-root `.env`. The aggregate object exposes `config.app`, `config.ca`,
`config.database`, `config.redis` (alias of the cache module), `config.session`, `config.jwt`,
`config.storage`, `config.ocsp`, `config.crl`, `config.logging`, `config.token`, and
`config.permissions`. `config.validate()` returns a list of warnings/errors.

### Environment variables

#### Server
| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` / `staging` / `production` |
| `PORT` | `3000` | HTTPS listen port (HTTP redirect runs on `PORT + 9`) |
| `HOST` | `0.0.0.0` | Bind address |
| `CLUSTER_ENABLED` | `false` | Enable cluster mode |
| `CLUSTER_WORKERS` | `4` | Worker count in cluster mode |

#### Database
| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `exprsn_ca` | Database name |
| `DB_USER` | `exprsn_ca_user` | Database user |
| `DB_PASSWORD` | — | Database password |
| `DB_SSL` | `false` | Use SSL/TLS for DB connection |
| `DB_POOL_MIN` / `DB_POOL_MAX` | `5` / `20` | Connection pool bounds |

#### TLS / HTTPS
| Variable | Default | Description |
|----------|---------|-------------|
| `TLS_ENABLED` | `true` | Enable HTTPS |
| `TLS_CERT_PATH` | `./certs/localhost-cert.pem` | Server certificate |
| `TLS_KEY_PATH` | `./certs/localhost-key.pem` | Server private key |

#### Security & Session
| Variable | Default | Description |
|----------|---------|-------------|
| `ENCRYPTION_KEY` | — | 32-byte hex key used to encrypt private keys at rest |
| `CORS_ORIGINS` | `http://localhost:3000,…` | Comma-separated allowed origins |
| `SESSION_SECRET` | `exprsn-ca-secret-change-me` | **Change in production** |
| `SESSION_MAX_AGE` | `86400000` | Session lifetime (ms, 24h) |
| `SESSION_SECURE` | `false` | HTTPS-only cookies (set `true` in prod) |
| `SESSION_SAME_SITE` | `lax` | Cookie `SameSite` policy |

#### Redis cache
| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_ENABLED` | `true` | Toggle caching (service degrades gracefully if off) |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Connection |
| `REDIS_PASSWORD` | — | Auth |
| `REDIS_DB` | `0` | DB index |
| `REDIS_KEY_PREFIX` | `exprsn:ca:` | Key namespace |
| `CACHE_TOKEN_TTL` | `60` | Token validation cache TTL (s) |
| `CACHE_CERT_TTL` | `300` | Certificate cache TTL (s) |
| `CACHE_OCSP_TTL` | `300` | OCSP response cache TTL (s) |

#### Certificate Authority identity & policy
| Variable | Default | Description |
|----------|---------|-------------|
| `CA_NAME` | `Exprsn Root CA` | Root CA common name |
| `CA_DOMAIN` | `ca.exprsn.io` | CA domain (used as token issuer domain) |
| `CA_COUNTRY` / `CA_STATE` / `CA_LOCALITY` | `US` / `California` / `San Francisco` | Subject DN parts |
| `CA_ORGANIZATION` | `Exprsn IO` | Organization |
| `CA_ORGANIZATIONAL_UNIT` | `Certificate Authority` | OU |
| `CA_EMAIL` | `ca@exprsn.io` | Contact email |
| `CA_ROOT_VALIDITY_DAYS` | `7300` | Root cert validity (~20 years) |
| `CA_INTERMEDIATE_VALIDITY_DAYS` | `3650` | Intermediate validity (~10 years) |
| `CA_ENTITY_VALIDITY_DAYS` | `365` | End-entity validity (1 year) |
| `CA_ROOT_KEY_SIZE` | `4096` | Root RSA key size |
| `CA_INTERMEDIATE_KEY_SIZE` | `4096` | Intermediate RSA key size |
| `CA_ENTITY_KEY_SIZE` | `2048` | Entity RSA key size |

#### JWT (web/admin auth helpers)
| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_PRIVATE_KEY` / `JWT_PUBLIC_KEY` | — | Base64-encoded PEM keys |
| `JWT_ISSUER` | `exprsn-ca` | Issuer claim |
| `JWT_ALGORITHM` | `RS256` | Signing algorithm |
| `JWT_ACCESS_TOKEN_EXPIRY` | `3600` | Access token lifetime (s) |
| `JWT_REFRESH_TOKEN_EXPIRY` | `2592000` | Refresh token lifetime (s) |

#### OCSP
| Variable | Default | Description |
|----------|---------|-------------|
| `OCSP_ENABLED` | `true` | Enable responder |
| `OCSP_PORT` | `2560` | Responder port |
| `OCSP_URL` | `http://ocsp.exprsn.io:2560` | Published responder URL |
| `OCSP_BATCH_ENABLED` | `false` | Batch request support |
| `OCSP_BATCH_TIMEOUT` | `100` | Batch window (ms) |
| `OCSP_CACHE_ENABLED` | `true` | Cache responses |
| `OCSP_CACHE_TTL` | `300` | Response cache TTL (s) |

#### CRL
| Variable | Default | Description |
|----------|---------|-------------|
| `CRL_ENABLED` | `true` | Enable CRL generation |
| `CRL_URL` | `http://crl.exprsn.io/crl` | Published CRL distribution point |
| `CRL_UPDATE_INTERVAL` | `3600` | Regeneration interval (s) |
| `CRL_NEXT_UPDATE_DAYS` | `7` | `nextUpdate` window |

#### Token rotation (optional)
| Variable | Default | Description |
|----------|---------|-------------|
| `TOKEN_ROTATION_ENABLED` | `false` | Enable scheduled rotation |
| `TOKEN_ROTATION_SCHEDULE` | `0 * * * *` | Cron schedule (hourly) |
| `TOKEN_ROTATION_THRESHOLD_MINUTES` | `60` | Rotate tokens expiring within this window |
| `TOKEN_ROTATION_BATCH_SIZE` | `10` | Tokens processed per run |
| `TOKEN_ROTATION_EXTENSION_SECONDS` | `3600` | New token lifetime |

#### Storage & logging
| Variable | Default | Description |
|----------|---------|-------------|
| `STORAGE_TYPE` | `disk` | `disk` / `s3` / `postgresql` |
| `STORAGE_PATH` | `./storage` | Disk storage root |
| `S3_BUCKET` / `S3_REGION` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` | — | S3 storage config |
| `LOG_LEVEL` | `info` | `error` / `warn` / `info` / `debug` |

---

## Data Model

The schema is provisioned via Sequelize migrations (`migrations/`). Core tables:

| Model / Table | Purpose | Notable fields |
|---------------|---------|----------------|
| **User** (`users`) | Platform identities | `email`, `username`, `passwordHash` (bcrypt), `status`, `emailVerified`, `failedLoginAttempts`, `lockedUntil`, `mfaEnabled`, `mfaSecret` |
| **Certificate** (`certificates`) | Issued X.509 certs | `serialNumber` (unique), `type`, `commonName`, `subjectAlternativeNames`, `keySize`, `algorithm`, `publicKey`, `privateKeyEncrypted`, `certificatePem`, `fingerprint`, `notBefore`, `notAfter`, `status`, `issuerId` |
| **Token** (`tokens`) | CA capability tokens | `version`, `permissionRead/Write/Append/Delete/Update`, `resourceType`, `resourceValue`, `expiryType`, `issuedAt`, `expiresAt`, `usesRemaining`, `maxUses`, `checksum`, `signature`, `status` |
| **Role** (`roles`) | RBAC roles | `name`, `slug`, `permissionFlags` (bitmask), `resourceType`, `resourcePattern`, `isSystem`, `priority`, `status` |
| **RoleSet** (`role_sets`) | Named collections of roles | grouping construct for bundling roles |
| **Group** (`groups`) | Org/teams/distribution lists | `name`, `slug`, `type`, `parentId` (hierarchical), `status`, `metadata` |
| **Profile** (`profiles`) | Per-user profiles | `name`, `type` (personal/business/developer/service), `isPrimary`, `organization`, `title` |
| **Ticket** (`tickets`) | One-time-use tickets | `ticketCode`, `type` (login/passwordReset/…), `maxUses`, `usesRemaining`, `expiresAt` |
| **PasswordReset** (`password_resets`) | Reset flow | `tokenHash` (SHA-256), `expiresAt`, `used` |
| **RevocationList** (`revocation_lists`) | Revoked certs | `certificateId`, `serialNumber`, `revokedAt`, `reason`, `issuerId` |
| **RateLimit** (`rate_limits`) | DB-driven limits | `targetType` (user/group/global), `endpoint`, `windowMs`, `maxRequests` |
| **AuditLog** (`audit_logs`) | Security audit trail | `action`, `resourceType`, `resourceId`, `status`, `severity`, `message`, `ipAddress`, `details` |

Join tables: `user_roles`, `user_groups`. Sessions are stored in a `sessions` table managed by
`connect-pg-simple`.

---

## CA Token System

CA Tokens are the platform's **capability-based authorization** primitive. A token binds a set
of permissions to a single resource, is signed by an issuing certificate's private key, and
carries a checksum for integrity. They implement the *Exprsn CA Token Specification v1.0*.
Implementation: `services/token.js`, `crypto/index.js`, `models/Token.js`, `config/token.js`.

### Token object shape

The signed/canonical token object looks like:

```jsonc
{
  "id": "<uuid>",
  "version": "1.0",
  "issuer": {
    "domain": "ca.exprsn.io",
    "certificateSerial": "<hex serial of signing cert>"
  },
  "permissions": {
    "read": true, "write": true, "append": false,
    "delete": false, "update": false
  },
  "resource": { "url": "https://api.exprsn.io/timeline/*" },
  "data": null,
  "issuedAt": 1716480000000,
  "notBefore": 1716480000000,
  "expiresAt": 1716483600000,
  "expiryType": "time",
  "checksum": "<sha256 hex>",
  "signature": "<base64 RSA-SHA256-PSS>"
}
```

### Permissions

Five boolean permissions are stored per token: **read, write, append, delete, update**. The CA
also defines a broader bitmask permission model used for roles (`config/permissions.js`):
`READ(1)`, `WRITE(2)`, `APPEND(4)`, `SHARE(8)`, `DELETE(16)`, `MODERATE(32)`, `LINK(64)`.

### Resource binding

Each token is bound to one resource via `resourceType` ∈ `url` | `did` | `cid` and a
`resourceValue` (up to 1000 chars). Validation matches the requested resource against the token
resource using:

- **Exact match** — strings are identical.
- **Wildcard match** — `*` in the token resource matches any path segment (`[^/]*`).
- **Prefix match** — a token resource ending in `/` matches any value beginning with it.

### Expiry types

| `expiryType` | Behaviour |
|--------------|-----------|
| `time` | Valid until `expiresAt` (epoch ms). `usesRemaining` is null. |
| `use` | Valid for `maxUses`; each successful validation atomically decrements `usesRemaining`. `expiresAt` is null. |
| `persistent` | Never expires (both `expiresAt` and `usesRemaining` null). |

### Generation

`TokenService.generateToken(params, userId)`:

1. Load and validate the signing certificate; fetch its private key from the storage layer.
2. Compute `issuedAt`, `notBefore`, and expiry fields per `expiryType`.
3. Persist a `Token` row (permissions, resource, expiry, status `active`).
4. Build the **canonical** token object (sorted keys) and compute the **SHA-256 checksum**.
5. Sign the canonical JSON with **RSA-SHA256-PSS** (salt length 32) using the cert private key.
6. Persist `checksum` + `signature`, write an audit log, and return the full token object.

### Validation

`TokenService.validateToken(tokenId, validationParams)` performs an ordered set of checks
(short-circuiting on the first failure), with a Redis cache for non-`use` tokens:

1. **Cache lookup** — return a cached result for time/persistent tokens if still valid.
2. **Existence** → `TOKEN_NOT_FOUND`.
3. **Status** — revoked → `TOKEN_REVOKED`.
4. **Time expiry** — past `expiresAt` → mark `expired`, return `TOKEN_EXPIRED`.
5. **notBefore** — too early → `TOKEN_NOT_YET_VALID`.
6. **Use exhaustion** → `TOKEN_NO_USES_REMAINING`.
7. **Certificate** — must exist, not be revoked, not be expired.
8. **Signature** — verify RSA-SHA256-PSS against the certificate's public key → `INVALID_SIGNATURE`.
9. **Permissions** — `requiredPermission` / `requiredPermissions` checked → `INSUFFICIENT_PERMISSIONS`.
10. **Resource** — `resourceValue` matched via the rules above → `RESOURCE_MISMATCH`.
11. **Usage update** — for `use` tokens, atomically decrement `usesRemaining` (guards against races); otherwise bump `useCount`/`lastUsedAt`.
12. Audit log and cache the successful result (TTL bounded by `CACHE_TOKEN_TTL` and remaining lifetime).

### Other operations

- **Revoke** — `revokeToken(id, reason, userId)`: sets status `revoked`, stamps `revokedAt`/`revokedReason`, invalidates cache, audits.
- **Refresh** — `refreshToken(id, newExpiresAt)`: extends expiry; **time-based tokens only**.
- **Introspect** — `introspectToken(id)`: returns rich metadata (status, issuer, subject, permissions, expiry, usage, certificate) without the signature.
- **List** — `listTokens(userId, filters)`: by status / resourceType / expiryType.

### Rotation (optional)

`services/tokenRotation.js` runs on the `TOKEN_ROTATION_SCHEDULE` cron. It finds active
`time`/`use` tokens expiring within `TOKEN_ROTATION_THRESHOLD_MINUTES`, issues a replacement
token (carrying `rotatedFrom`, `rotationCount`, `originalTokenId` in `data`), and revokes the
original — all audited.

---

## Certificate Management

Implemented in `services/certificate.js` + `crypto/index.js` (`models/Certificate.js`).

### Certificate types

| Type | Default key size | Default validity | Key usage |
|------|------------------|------------------|-----------|
| `root` | 4096 | 7300 days (~20y) | `keyCertSign`, `cRLSign`, `cA:true` (self-signed) |
| `intermediate` | 4096 | 3650 days (~10y) | `keyCertSign`, `cRLSign`, `digitalSignature`, `cA:true`, `pathLenConstraint` |
| `entity` / `client` | 2048 | 365 days | `digitalSignature`, `keyEncipherment` + `extKeyUsage: clientAuth` |
| `server` | 2048 | 365 days | `digitalSignature`, `keyEncipherment` + `extKeyUsage: serverAuth` |
| `code_signing` | 2048 | — | `digitalSignature` + `extKeyUsage: codeSigning` |
| `san` | 2048 | 365 days | entity cert with Subject Alternative Names |

All certificates use **SHA-256** for signing and a 16-byte random hex serial number. Standard
extensions (`basicConstraints`, `subjectKeyIdentifier`, `authorityKeyIdentifier`) are set, and
SANs support `DNS`, `IP:`, and `email:` prefixes.

### Root CA auto-generation

On the first complete startup with no active root certificate, the service generates a 4096-bit
self-signed root (using `CA_*` config), persists the certificate record, and writes the
certificate and private key to the storage layer (`storage.saveCertificate` / `savePrivateKey`).

### Revocation

Revoking a certificate sets its status to `revoked`, adds a `RevocationList` entry (with an RFC
5280 reason code such as `keyCompromise`, `cessationOfOperation`, etc.), triggers CRL
regeneration, and writes an audit record.

---

## OCSP Responder

`services/ocsp.js` + `config/ocsp.js`. Serves certificate-status queries on `OCSP_PORT` (2560),
with optional in-memory caching (`OCSP_CACHE_TTL`) and optional batching. Status values:
`good`, `revoked`, `expired`, `unknown`.

Endpoints (mounted at `/ocsp`):

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/ocsp` | Check a single certificate (`serialNumber` in body) |
| `POST` | `/ocsp/batch` | Check multiple certificates (`serialNumbers` array) |
| `GET` | `/ocsp/status` | Responder operational status + cache stats |

---

## Certificate Revocation List (CRL)

`services/crl.js` + `config/crl.js`. On `initialize()` it loads the root CA cert/key, queries the
`RevocationList`, builds a signed CRL with `node-forge`, and schedules regeneration every
`CRL_UPDATE_INTERVAL` seconds with a `nextUpdate` of `CRL_NEXT_UPDATE_DAYS`.

Endpoints (mounted at `/crl`):

| Method | Path | Content type | Purpose |
|--------|------|--------------|---------|
| `GET` | `/crl` | `application/x-pem-file` | CRL in PEM |
| `GET` | `/crl/der` | `application/pkix-crl` | CRL in DER |
| `GET` | `/crl/info` | `application/json` | Metadata (issuedAt, nextUpdate, revoked count) |

---

## Cryptography

`crypto/index.js` wraps `node-forge` and Node `crypto`:

| Function | Purpose |
|----------|---------|
| `generateKeyPair(keySize)` | RSA key pair (PEM + forge objects) |
| `generateRootCertificate(opts)` | Self-signed root CA |
| `generateIntermediateCertificate(opts)` | Intermediate CA signed by issuer |
| `generateEntityCertificate(opts)` | client/server/code-signing entity cert with SANs |
| `signData(data, privateKeyPem)` | **RSA-SHA256-PSS** signature (MGF1-SHA256, salt 32) → base64 |
| `verifySignature(data, sig, publicKeyPem)` | Verify a PSS signature |
| `calculateChecksum(obj)` | SHA-256 over canonical (sorted-key) JSON |
| `calculateFingerprint(cert)` | SHA-256 over DER |
| `verifyCertificateChain(certPem, chainPems)` | Chain validation against a CA store |
| `encryptPrivateKey` / `decryptPrivateKey` | AES-256 PEM encryption for keys at rest |

---

## Storage Layer

`storage/index.js` returns an adapter based on `STORAGE_TYPE`. All adapters share a common
interface (`saveCertificate`, `savePrivateKey`, `getCertificate`, `getPrivateKey`, `initialize`):

| Adapter | Backing store | Notes |
|---------|---------------|-------|
| `disk` | Local filesystem under `STORAGE_PATH` | Default; separate dirs for certs/keys |
| `s3` | AWS S3 / S3-compatible | Uses `S3_*` config |
| `database` | PostgreSQL columns | Private keys stored encrypted (`ENCRYPTION_KEY`) |

---

## Authentication, Sessions & Middleware

- **Sessions** — `express-session` backed by PostgreSQL (`connect-pg-simple`, `sessions` table).
  Cookies are `httpOnly`, with `secure`/`sameSite`/`maxAge` driven by `SESSION_*` config. Login
  populates `req.session.user`.
- **`middleware/auth.js`** — `requireAuth` (redirect to `/auth/login` for web, 401 JSON for API),
  `requireAuthAPI`, `optionalAuth`, `redirectIfAuthenticated`, `requirePermissions(...)`, and
  `attachUserToLocals` (exposes the user to all EJS views).
- **`middleware/rateLimit.js`** — DB-driven (`RateLimit` model) and `express-rate-limit` limiters
  (`standardLimiter`, `strictLimiter`) with Redis counters and in-memory fallback.
- **`middleware/permissionCache.js`** — caches RBAC permission lookups in Redis.
- **`middleware/setupCheck.js`** — redirects to `/setup` until the CA is initialized.
- **`middleware/socketAuth.js`** — authenticates Socket.IO connections from the session.
- **`middleware/validation.js`** — `validate(schema)` runs Joi schemas from `validators/`.
- **Helmet CSP** — a content-security policy allowing self + `cdn.jsdelivr.net` for styles/scripts
  and `ws:`/`wss:` for WebSockets.

---

## Inter-Service Communication (IPC)

The CA runs a shared `IPCWorker` (`serviceName: 'exprsn-ca'`, namespace `ipc`) so other services
can validate certificates and tokens without HTTP round-trips:

| Inbound event | Action | Reply event |
|---------------|--------|-------------|
| `cert:validate` | Looks up a `Certificate` by `certificateId` or `serialNumber` | `cert:validated` (`valid`, `status`, `notBefore`, `notAfter`) |
| `token:validate` | Looks up a `Token` by `tokenId`, checks active + not expired | `token:validated` (`valid`, `status`, `expiresAt`, `permissions`) |

Replies are targeted back to the requesting service (`meta.source`). The IPC instance is also
attached to every request as `req.ipc`.

---

## HTTP API Reference

> All API endpoints return JSON. Token/certificate write operations require an authenticated
> session and are protected by rate limiters and Joi validation.

### Tokens — `/api/tokens`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/tokens/generate` | Generate a signed CA token (returns full token + checksum + signature) |
| `POST` | `/api/tokens/validate` | Validate a token by ID/object against a resource + permission |
| `POST` | `/api/tokens/revoke` | Revoke a token |
| `GET` | `/api/tokens` | List the caller's tokens |
| `POST` | `/api/tokens/:id/refresh` | Extend a time-based token's expiry |
| `GET` | `/api/tokens/:id/introspect` | Token metadata / introspection |

**Generate example**

```http
POST /api/tokens/generate
Content-Type: application/json

{
  "certificateId": "<uuid>",
  "permissions": { "read": true, "write": true },
  "resourceType": "url",
  "resourceValue": "https://api.exprsn.io/timeline/*",
  "expiryType": "time",
  "expirySeconds": 3600
}
```

**Validate example**

```http
POST /api/tokens/validate
Content-Type: application/json

{
  "tokenId": "<uuid>",
  "resourceValue": "https://api.exprsn.io/timeline/posts",
  "requiredPermission": "write"
}
```

### Certificates — `/api/certificates`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/certificates/generate-root` | Generate the root CA (admin) |
| `POST` | `/api/certificates/generate-intermediate` | Generate an intermediate CA (admin) |
| `POST` | `/api/certificates/generate-code-signing` | Generate a code-signing certificate |
| `POST` | `/api/certificates/generate` | Generate an end-entity certificate |
| `POST` | `/api/certificates/csr` | Process a Certificate Signing Request |
| `GET` | `/api/certificates/:id` | Fetch certificate details |
| `GET` | `/api/certificates/:id/chain` | Full chain (root → intermediate → entity) |
| `GET` | `/api/certificates/:id/download` | Download (`?format=pem|der`) |
| `POST` | `/api/certificates/:id/renew` | Renew a certificate |

### Auth helper — `/api/auth`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/verify-password` | Verify a password (strict-limited; used for MFA confirmation) |

### OCSP / CRL

See the [OCSP](#ocsp-responder) and [CRL](#certificate-revocation-list-crl) sections.

### Admin API — `/admin/api`

A protected admin surface (requires authenticated admin/super-admin/ca-admin) backing the
dashboard, including: `GET /admin/api/stats`, `/admin/api/activity`,
`/admin/api/certificates/recent`, `/admin/api/tokens/recent`, `/admin/api/timeseries/:type`,
`/admin/api/health`, `/admin/api/users|groups|roles`, `POST /admin/api/certificates/issue`,
`POST /admin/api/certificates/:id/revoke`, `GET /admin/api/certificates/:id/download`,
`POST /admin/api/tokens/generate|validate`, `POST /admin/api/tokens/:id/revoke`,
`GET /admin/api/ocsp/status`, `GET /admin/api/crl/status`, `POST /admin/api/crl/generate`, and a
whitelisted `GET|POST /admin/api/config[/update]`.

### Setup-dashboard config — `/api/config`

`GET|POST /api/config/:sectionId` (sections: `cert-root`, `cert-intermediate`, `cert-tokens`,
`cert-ocsp`). **Note:** these endpoints are not auth-gated and are intended for the
first-run/dashboard configuration flow — restrict access at the network layer in production.

---

## Web UI Routes

Server-rendered EJS pages (most require an authenticated session):

| Path | Page |
|------|------|
| `GET /`, `/dashboard`, `/about` | Home / dashboard / about |
| `GET /auth/login`, `POST /auth/login` | Login |
| `GET /auth/register`, `POST /auth/register` | Registration |
| `GET /auth/logout` | Logout |
| `GET /ca`, `/ca/initialize`, `/ca/certificates/dashboard`, `/ca/tokens/dashboard` | CA admin views |
| `GET /certificates`, `/certificates/new`, `/certificates/:id` | Certificate management UI |
| `GET /tokens`, `/tokens/new` | Token management UI |
| `GET /users`, `/groups`, `/roles`, `/tickets` | Identity & RBAC list views |
| `POST /tickets/generate` | Create a one-time ticket |
| `GET /admin`, `/admin/operations` | Admin dashboard |

---

## First-Run Setup Wizard

`routes/setup.js` + `services/setup.js` serve a guided wizard (mounted before the setup-check
gate so it is always reachable). `isSetupComplete()` is true once an active root CA exists.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/setup` | Wizard UI |
| `GET` | `/setup/status` | Completion status |
| `POST` | `/setup/test-database` | Validate DB connection params |
| `POST` | `/setup/test-redis` | Validate Redis connection |
| `POST` | `/setup/test-smtp` | Validate SMTP settings |
| `POST` | `/setup/validate-sso` | Validate SAML/SSO config |
| `POST` | `/setup/upload-ddl` | Upload/apply DB schema |
| `POST` | `/setup/create-service-databases` | Create per-service databases |
| `POST` | `/setup/create-s3-buckets` | Provision S3 buckets |
| `POST` | `/setup/test-s3` | Validate S3 connection |
| `POST` | `/setup/validate` | Validate full config (errors/warnings) |
| `POST` | `/setup/run` | Execute setup: admin user, root + intermediate certs, default groups & roles |

---

## Running the Service

```bash
cd src/exprsn-ca
cp .env.example ../../.env     # config is loaded from the project-root .env
npm install

# Development (hot reload)
npm run dev

# Production
npm start

# Tests
npm test
npm run test:coverage
npm run test:integration
```

Available scripts: `dev`, `start`, `test`, `test:coverage`, `test:integration`, `setup`,
`migrate`, `seed`, `lint`, `format`.

From the monorepo root you can also use `npm run start:ca`, `npm run start:cluster`, or
`npm run generate:root-cert`.

---

## Security Considerations

- **Change `SESSION_SECRET`** and set `SESSION_SECURE=true` in production.
- **Protect private keys** — set a strong `ENCRYPTION_KEY`; consider an HSM for the root key.
- **Always RSA-SHA256-PSS** for tokens and **SHA-256** for certificate signing — no MD5/SHA-1.
- **Restrict unauthenticated routes** — `/setup/*` and `/api/config/*` are not auth-gated by
  design (bootstrap/dashboard); firewall them once setup is complete.
- **Disable the dev bypass** in production (it short-circuits auth when enabled).
- **Audit everything** — token/certificate operations are written to `audit_logs`; monitor them.
- **Rotate** certificates before expiry and revoke immediately on suspected compromise.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Service stuck redirecting to `/setup` | Setup incomplete — no active root CA. Complete the wizard or run `npm run generate:root-cert`. |
| `INVALID_SIGNATURE` on token validation | Clock skew (sync NTP), signing certificate revoked/expired, or token tampered with. |
| OCSP not reachable | Confirm `OCSP_PORT` (2560) is open: `lsof -i :2560`. |
| CRL service warns at startup | Root CA missing at init — it retries once the root cert exists. |
| Caching warnings | `REDIS_ENABLED=false` or Redis unreachable — the service runs without caching. |
| Certificate expiry | Check with `openssl x509 -in cert.pem -noout -enddate`; renew via `POST /api/certificates/:id/renew`. |

---

## Related Documentation

- [Exprsn-Auth — Authentication & SSO](./exprsn-auth.md)
- Platform overview: repository [`README.md`](../README.md)
- Wiki: `wiki/services/exprsn-ca.md`, `wiki/architecture/System-Architecture.md`
