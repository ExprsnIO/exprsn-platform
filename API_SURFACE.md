# Exprsn Platform — API & Socket.IO Surface

Reference inventory of every RESTful endpoint and Socket.IO event across the ten
consolidated modules. Generated from a source read of `services/<name>/` on
2026-06-16. All paths are shown **from the gateway root** (`https://localhost:8443`),
i.e. gateway prefix + router mount + in-router path.

Columns: **Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults**.
"—" means none. Where a route has no auth middleware it is marked `none` (public).

## Conventions & cross-cutting auth

- **Session (Passport/cookie)** — `req.session.user` / `req.user`; used by `ca` and `auth`.
- **CA token** — bearer token validated against the CA service (`POST /api/tokens/validate`),
  carrying permission flags `read` / `write` / `update` / `delete` / `admin`, often scoped to a
  resource prefix. Used by `auth` (users/groups/tokens), `spark`, `nexus`, `filevault`, `vault`,
  `timeline`, `prefetch`.
- **Service HMAC** — per-service `X-Service-ID` / `X-Service-Token` derived from `SERVICE_TOKEN_SECRET`.
- **DEV_BYPASS** — fail-closed dev-only auth bypass (loopback + secret header + `NODE_ENV=development`).
- Joi/express-validator schemas generally run with `stripUnknown: true` — unknown body fields are
  silently dropped.
- Global body limit is 10 MB unless a route overrides it.

### Security flags worth noting

- `auth`: `GET`/`POST /auth/api/config/:sectionId` have **no auth** — public read/write of config
  sections (GET leaks user/org/role listings).
- `auth`: `oidcRoutes` is mounted with no prefix **before** `/api/oauth2`, so the OIDC handlers
  shadow the matching `oauth2.js` `userinfo`/`introspect`/`revoke` handlers.
- `moderator`: all REST routes are **unauthenticated** except `/api/notifications` (service HMAC);
  several handlers read `req.user` that nothing populates.
- `nexus`: `requireToken` / `optionalToken` are **factories** — `requireToken(opts)` returns the
  middleware. Several routers (events, governance, moderation, recommendations, subgroups, trending,
  calendar) used to pass them as a **bare reference**, so Express invoked the factory and discarded
  the middleware, leaving those routes unauthenticated **and** hanging (next() never fired). Fixed —
  all usages are now invoked, matching groups/memberships. Regression guard:
  `tests/integration/routes/authWiring.test.js` exercises the real middleware (no mock) and asserts a
  prompt 401 without a bearer.
- `prefetch`: the `prefetch.js` router is **double-mounted** at `/api/prefetch` and `/api/cache`, so
  every endpoint is reachable under both prefixes.
- `live` `/live` and `moderator` `/moderation` Socket.IO namespaces have **no handshake token auth**
  (flagged `TODO(platform)`). The `ca` `/ca` namespace connects unauthenticated sockets too.
- `vault` `/vault` namespace bypasses CA-token validation in non-production (any token → dev user).
- `timeline`: `POST /api/webhooks/moderator` has **no signature check**; the bluesky webhook uses HMAC.
- `filevault`: share-link GET endpoints are unauthenticated — access is by knowing the share-link UUID.

---

## CA module (prefix /ca)

Global notes: ACME router overrides body limit to 1 MB; OCSP POST `/` uses a raw 10 KB limit.
`validate(schema)` = Joi middleware (`stripUnknown`, `abortEarly:false`). Admin routes accept
`admin` / `super-admin` / `ca-admin` role slugs or a platform-admin Bearer token. Empty stub routers
(`/ca`, `/certificates`, `/tokens`, `/users`, `/groups`, `/roles`) have no endpoints — operations live
under `/api` and `/admin`.

### REST endpoints

| Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| POST | /ca/tickets/generate | — (uses `req.session.user.id`) | `type`, `maxUses` | — | Session | `type='login'`, `maxUses=1`, expires 5 min |
| POST | /ca/api/tokens/generate | `certificateId`(uuid), `permissions`, `resource`{type,value} | `expiryType`, `expiresAt`, `maxUses`, `notBefore`, `groupId`(uuid), `organizationId`(uuid), `data` | `resource.value`≤1000; `maxUses` 1–1,000,000; `expiresAt`/`notBefore`≥now | requireSession | perms default false; `expiryType='time'`; scope groups must be active; non-admins must be members; org must be organizational_unit/department (spec v1.1) |
| POST | /ca/api/tokens/validate | one of `token` / `tokenId` | `requiredPermissions`, `resource`, `resourceValue` | `tokenId` uuid; resource ≤1000 | 100/15min + session OR service HMAC | invalid if signing cert revoked/expired or a scope group is inactive |
| POST | /ca/api/tokens/revoke | `tokenId`(uuid) | `reason`(≤255) | `reason`≤255 | requireSession — owner, system admin, or admin/owner of the token's group/org scope | `reason='User requested revocation'`; records `revokedBy`; resp includes `revokedReason`,`revokedBy` |
| POST | /ca/api/tokens/revoke-bulk | `scope`∈user/group/organization, `targetId`(uuid) | `reason`(≤255) | — | requireSession — user scope: self or admin; group/org scope: that group's admin/owner or admin | resp `{success,revokedCount}`; records `revokedBy` |
| GET | /ca/api/tokens | — | `status`, `limit`, `groupId`, `organizationId` | — | requireSession; scope filters need group/org admin (or system admin) | `limit=50`; rows include v1.1 fields (`version`,`maxUses`,`useCount`,`revokedBy`,`group`,`organization`,`certificate{status}`) |
| GET | /ca/api/users/me/groups | — | — | — | requireSession | caller's CA directory groups with membership `role` (member/admin/owner) |
| POST | /ca/api/tokens/:id/refresh | `expiresAt`(int≥now), `tokenId`(uuid) | — | `expiresAt`≥now | requireSession | — |
| GET | /ca/api/tokens/:id/introspect | `id` | — | — | requireSession | — |
| POST | /ca/api/certificates/generate-root | `commonName` | org/OU/country/state/locality/email, `keySize`, `validityYears`, `algorithm` | `commonName` 1–255; `country` len2; `keySize`∈2048/4096/8192; `validityYears` 1–30 | requireAdminSession | `keySize=4096`, `validityYears=10`, `algorithm='RSA-SHA256'` |
| POST | /ca/api/certificates/generate-intermediate | `commonName`, `issuerId`(uuid) | subject fields, `keySize`, `validityYears`, `algorithm` | `keySize`∈2048/4096; `validityYears` 1–20 | requireAdminSession | `keySize=4096`, `validityYears=5`, `RSA-SHA256` |
| POST | /ca/api/certificates/generate-code-signing | `commonName` | subject fields, `subjectAlternativeNames`, `issuerId`, `keySize`, `validityDays`, `algorithm` | SAN≤100 (each ≤255); `keySize`∈2048/4096; `validityDays` 1–825 | requireAdminSession | `keySize=2048`, `validityDays=365`, `type='code_signing'` |
| POST | /ca/api/certificates/generate | `commonName` | `type`, subject fields, SAN, `issuerId`, `keySize`, `validityDays`, `algorithm`, `password` | `type`∈entity/san/code_signing/client/server | requireSession | `type='entity'`, `keySize=2048`, `validityDays=365`; `issuerId` defaults to platform signing CA (active intermediate, else root) |
| GET | /ca/api/certificates | — | `type`, `status`, `limit`, `offset` | `limit`≤200 | requireSession | own certs only; `limit=50`, `offset=0`; resp `{success,certificates[],count}` (no private key) |
| GET | /ca/api/certificates/:id | `id` | — | — | requireSession (+ownership) | — |
| POST | /ca/api/certificates/:id/revoke | `id` | `reason` | `reason`∈X.509 revocation reasons | requireSession (owner-or-admin) | `reason='unspecified'`; cascades token revocation; resp `{success,certificate,revokedTokenCount}` |
| GET | /ca/api/certificates/:id/export | `id` | `format`, `password` (query or `X-Export-Password` header) | `format`∈pem/der/chain/pkcs12 | requireSession (owner-or-admin) | `format='pem'`; pkcs12 needs `password`+stored encrypted key (else 400 PASSWORD_REQUIRED/NO_PRIVATE_KEY/INVALID_PASSWORD); resp is a file download (pkcs12→`application/x-pkcs12` `.p12`) |
| GET | /ca/api/certificates/:id/status | `id` | — | — | requireSession (owner-or-admin) | live status: `{success,serialNumber,status,revoked,revocationReason,revokedAt,ocsp:{enabled,status},crl:{enabled,crlNumber,thisUpdate,nextUpdate,listed}}` |
| POST | /ca/api/certificates/csr | `csr`(PEM) | `validityDays`, `type`, `issuerId` | `validityDays` 1–825 | requireAdminSession | `validityDays=365`, `type='entity'` |
| POST | /ca/api/certificates/:id/renew | `certificateId`(uuid) | `validityDays`, `keySize` | `validityDays` 1–825; `keySize`∈2048/4096 | requireSession (owner-or-admin) | — (schema requires body `certificateId` despite `:id`) |
| GET | /ca/api/certificates/:id/chain | `id` | — | — | requireSession (+ownership) | — |
| GET | /ca/api/certificates/:id/download | `id` | `format` | `format`∈pem/der | requireSession (+ownership) | `format='pem'` |
| POST | /ca/api/auth/verify-password | `userId`, `password` | — | — | 10/15min + requireSession | — |
| GET | /ca/api/config/:sectionId | `sectionId`∈cert-root/cert-intermediate/cert-tokens/cert-ocsp | — | — | requireAdminSession | — |
| POST | /ca/api/config/:sectionId | `sectionId`; config object | — | — | requireAdminSession | — |
| GET | /ca/admin/api/stats | — | — | — | requireAdmin | — |
| GET | /ca/admin/api/activity | — | `limit`, `offset` | — | requireAdmin | `limit=50`, `offset=0` |
| GET | /ca/admin/api/certificates/recent | — | `limit` | — | requireAdmin | `limit=20` |
| GET | /ca/admin/api/tokens/recent | — | `limit` | — | requireAdmin | `limit=20` |
| GET | /ca/admin/api/timeseries/:type | `type`∈certificates/tokens/users | `days`, `interval` | `interval`∈hour/day/week | requireAdmin | `days=7`, `interval='day'` |
| GET | /ca/admin/api/health | — | — | — | requireAdmin | — |
| GET | /ca/admin/api/users | — | `limit`, `offset`, `search` | — | requireAdmin | `limit=50`, `offset=0`, `search=''` |
| GET | /ca/admin/api/groups | — | — | — | requireAdmin | — |
| GET | /ca/admin/api/roles | — | — | — | requireAdmin | — |
| POST | /ca/admin/api/certificates/issue | `type`, `commonName` | subject fields, `keySize`, `validityDays`, SAN | `commonName` 1–255; `keySize`∈2048/4096; `validityDays` 1–825 | requireAdmin + validate | `type='entity'`, `keySize=2048`, `validityDays=365` |
| POST | /ca/admin/api/certificates/:id/revoke | `id` | `reason` | — | requireAdmin | cascades token revocation; resp `{success,revokedTokenCount}` |
| GET | /ca/admin/api/certificates/:id/download | `id` | — | — | requireAdmin | — |
| POST | /ca/admin/api/tokens/generate | `certificateId`(uuid), `resourceType`∈url/did/cid, `resourceValue`(≤1000) | `permissions`, `expiryType`∈time/use/persistent, `expirySeconds`, `maxUses`, `notBefore`, `userId`(subject), `groupId`, `organizationId`, `data` | `maxUses` 1–1,000,000 (required for `use`) | requireAdmin + validate(adminGenerateTokenSchema) | `permissions={read:true}`, `expiryType='time'`, `expirySeconds=3600`; `userId` defaults to acting admin |
| POST | /ca/admin/api/tokens/validate | `tokenId` | `resourceValue`, `requiredPermission` | — | requireAdmin | — |
| POST | /ca/admin/api/tokens/:id/revoke | `id`; `tokenId`(uuid) | `reason`(≤255) | — | requireAdmin + validate | `reason='Revoked by administrator'`; records `revokedBy` |
| POST | /ca/admin/api/tokens/revoke-bulk | `scope`∈user/group/organization, `targetId`(uuid) | `reason`(≤255) | — | requireAdmin + validate | resp `{success,revokedCount}` |
| GET | /ca/admin/api/ocsp/status | — | — | — | requireAdmin | — |
| GET | /ca/admin/api/crl/status | — | — | — | requireAdmin | — |
| POST | /ca/admin/api/crl/generate | — | — | — | requireAdmin | — |
| GET | /ca/admin/api/config | — | — | — | requireAdmin | masked safe config |
| POST | /ca/admin/api/config/update | `updates`(object) | — | whitelisted keys only (others→403) | requireAdmin | — |
| GET | /ca/admin/api/certificates | — | `status`, `type`, `limit`, `offset` | — | requireAdmin | `limit=50`, `offset=0` |
| GET | /ca/admin/api/tokens | — | `status`, `expiryType`, `userId`, `certificateId`, `groupId`, `organizationId`, `limit`, `offset` | — | requireAdmin | `limit=50`, `offset=0`; rows include `user`, `certificate{status}`, `group`, `organization` |
| POST | /ca/ocsp/ | raw DER OCSPRequest | — | raw body ≤10 KB | Public | — |
| GET | /ca/ocsp/status | — | — | — | Public | — |
| POST | /ca/ocsp/batch | `serialNumbers`(array≥1) | — | array ≥1 | Public | — |
| GET | /ca/ocsp/* | base64 DER OCSPRequest | — | — | Public | — |
| GET | /ca/crl/current.crl | — | — | — | Public | DER, cacheable |
| GET | /ca/crl/ | — | — | — | Public | PEM attachment |
| GET | /ca/crl/der | — | — | — | Public | DER attachment |
| GET | /ca/crl/info | — | — | — | Public | — |
| GET | /ca/acme/directory | — | — | — | Public | — |
| HEAD/GET | /ca/acme/new-nonce | — | — | — | Public | 200/204, no-store |
| POST | /ca/acme/new-account | JWS (jwk) | `onlyReturnExisting`, `termsOfServiceAgreed`, `contact` | — | JWS signature | `contact=[]`; ToS enforced if `ACME_TOS_URL` set |
| POST | /ca/acme/acct/:id | JWS (kid); `id` | `status`(deactivated), `contact` | — | JWS (kid), account match | — |
| POST | /ca/acme/acct/:id/orders | JWS (kid); `id` | — | ≤100 orders returned | JWS (kid), account match | — |
| POST | /ca/acme/new-order | JWS (kid); `identifiers`(≥1, dns) | `notBefore`, `notAfter` | identifiers ≥1, dns only | JWS (kid) | order 7d, authz 30d |
| POST | /ca/acme/order/:id | JWS (kid); `id` | — | — | JWS (kid), order owned | — |
| POST | /ca/acme/authz/:id | JWS (kid); `id` | `status`(deactivated) | — | JWS (kid), authz owned | — |
| POST | /ca/acme/chall/:id | JWS (kid); `id` | — | — | JWS (kid), authz owned | — |
| POST | /ca/acme/order/:id/finalize | JWS (kid); `csr`(base64url DER) | — | CSR names == order identifiers | JWS (kid), order 'ready' | validity `ACME_CERT_VALIDITY_DAYS`/90d |
| POST | /ca/acme/cert/:id | JWS (kid); `id` | — | — | JWS (kid), order owned | PEM chain |
| POST | /ca/acme/revoke-cert | JWS; `certificate`(base64url DER) | `reason`(code 0–10) | reason code in map | JWS (kid or jwk) | `reason='unspecified'` |
| POST | /ca/acme/key-change | JWS (kid) | — | — | JWS (kid) | always 501 |

> Note (resolved 2026-07-02): `/ca/admin/api/tokens/generate` previously had a schema/handler
> field mismatch; it now validates with a dedicated `adminGenerateTokenSchema` matching the
> handler's flat `resourceType`/`resourceValue`/`expirySeconds`/`maxUses` shape.
>
> Token spec v1.1 (2026-07-02): tokens carry optional `groupId`/`organizationId` scope
> (CA directory groups; org = organizational_unit/department) and `revokedBy`. Invalidation
> principals: token owner, system admin, or an admin/owner (`"UserGroups".role`) of the token's
> group/org. Certificate revocation cascades to its tokens (`certificate_revoked`, `revokedBy`
> recorded). Use-based tokens verify signatures against issuance values (`usesRemaining=maxUses`).

### Socket.IO events (namespace /ca)

Namespace auth middleware **always calls `next()`** — unauthenticated sockets connect with
`socket.authenticated=false`. The stricter `socketAuth.js` helpers exist but are **not wired in**.
Subscribe events enforce no auth. All server emits include `timestamp=Date.now()` unless noted.

| Event | Direction | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| certificate:subscribe / unsubscribe | client→server | `certificateId` | — | — | none | joins `certificate:<id>` |
| token:subscribe / unsubscribe | client→server | `tokenId` | — | — | none | joins `token:<id>` |
| dashboard:subscribe | client→server | — | — | — | needs `socket.user` | joins `dashboard:<userId>` |
| ping | client→server | — | — | — | none | replies `pong` |
| pong | server→client | `timestamp` | — | — | — | — |
| certificate:created | server→client | `certificateId`, `commonName`, `certificateType`, `status`, `timestamp` | — | — | — | — |
| certificates:updated | server→client | `action`, `certificateId` | — | — | — | — |
| certificate:revoked | server→client | `certificateId`, `reason`, `timestamp` | — | — | — | — |
| token:created | server→client | `tokenId`, `certificateId`, `resourceType`, `status`, `timestamp` | — | — | — | — |
| tokens:updated | server→client | `action`, `tokenId` | — | — | — | — |
| token:revoked | server→client | `tokenId`, `reason`, `timestamp` | — | — | — | — |
| token:validated | server→client | `tokenId`, `valid`, `errors`, `timestamp` | — | — | — | — |
| token:used | server→client | `tokenId`, `valid`, `timestamp` | — | — | — | — |
| user:login | server→client | `userId`, `sessionInfo`, `timestamp` | — | — | — | — |
| dashboard:stats | server→client | `stats`, `timestamp` | — | — | — | — |
| user:created / updated / deleted | server→client | `userId` (+`username`/`changes`), `timestamp` | — | — | — | — |
| group:created / updated | server→client | `groupId` (+`name`/`changes`), `timestamp` | — | — | — | — |
| role:created | server→client | `roleId`, `name`, `timestamp` | — | — | — | — |
| system:health | server→client | `health`, `timestamp` | — | — | — | — |
| moderation:event | server→client | `eventType`, `data`, `timestamp` | — | — | — | — |
| system:notification | server→client | `message`, `level`, `timestamp` | `targetUserId` | — | — | `level='info'` |

---

## Auth module (prefix /auth)

Mounted routes dir is **`services/auth/src/routes/`** (the sibling `services/auth/routes/` is **not**
mounted). `requireAuth` = active Passport session. CA-token routes use `validateCAToken({requiredPermissions})`.
`oidcRoutes` is mounted with no prefix and registered before `/api/oauth2`, so OIDC handlers win for
the shared `userinfo`/`introspect`/`revoke` paths. No Socket.IO (registry `socketNs: null`).
`strictLimiter` ≈ 10 req/15min on auth/mfa writes. Password rule: 8–128 chars with upper/lower/digit/special.

### REST endpoints

| Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| GET | /auth/health, /auth/health/db, /auth/health/ca | — | — | — | Public | — |
| GET | /auth/.well-known/openid-configuration | — | — | — | Public | — |
| GET | /auth/.well-known/jwks.json | — | — | — | Public | — |
| POST | /auth/api/auth/register | `email`, `password` | `displayName`, `confirmPassword` | email ≤255; password 8–128+pattern; displayName 1–100 | Public (strict) | 201 |
| POST | /auth/api/auth/login | `email`, `password` | `rememberMe` | email valid | Public (strict) | `rememberMe=false`; MFA→`{mfaRequired,mfaToken}` |
| POST | /auth/api/auth/mfa/verify | `mfaToken`, `code` | — | — | Public (strict), valid pending token | TOTP window=1; backup-code fallback |
| POST | /auth/api/auth/exchange | `code` | — | — | Public (strict), single-use 60s | — |
| POST | /auth/api/auth/logout | — | — | — | Session | — |
| POST | /auth/api/auth/forgot-password | `email` | — | email valid | Public (strict) | reset token 1h; token returned only in dev |
| POST | /auth/api/auth/reset-password | `token`, `password`, `confirmPassword` | — | token 64 hex; password 8–128+pattern | Public (strict) | — |
| GET | /auth/api/auth/google[/callback] | — | — | — | Public / Passport | scope profile,email |
| GET | /auth/api/auth/github[/callback] | — | — | — | Public / Passport | scope user:email |
| POST | /auth/api/auth/verify-email | `token` | — | token 64 hex | Public | — |
| POST | /auth/api/auth/resend-verification | `email` | — | email valid | Public (strict) | dev returns token |
| POST | /auth/api/auth/change-password | `currentPassword`, `newPassword`, `confirmPassword` | — | newPassword 8–128+pattern, ≠current | Session | — |
| GET | /auth/api/auth/me | — | — | — | Session | — |
| POST | /auth/api/auth/token | — | — | — | Session (MFA verified) | re-mints CA token |
| POST | /auth/api/mfa/setup | — | — | — | Session | 10 backup codes |
| POST | /auth/api/mfa/verify | `token` | — | — | Session + strict | TOTP window=1 |
| POST | /auth/api/mfa/validate | `token` | — | — | Session + strict | TOTP or backup code |
| POST | /auth/api/mfa/disable | `password` | — | — | Session + strict | — |
| POST | /auth/api/mfa/regenerate-backup-codes | `password` | — | — | Session + strict | 10 codes |
| GET | /auth/api/mfa/status | — | — | — | Session | — |
| GET | /auth/api/sessions | — | — | — | Session | order lastActivityAt DESC |
| GET | /auth/api/sessions/current | — | — | — | Session | — |
| DELETE | /auth/api/sessions/:id | `id` | — | — | Session | cannot revoke current |
| DELETE | /auth/api/sessions | — | — | — | Session | revokes all except current |
| POST | /auth/api/sessions/refresh | — | — | — | Session | extends by session lifetime |
| GET | /auth/api/users | — | `limit`, `offset`, `search` | `limit`≤200 | CA `read` **+ admin** | list; admin-only (exposes email/mfa); search matches email/displayName |
| POST | /auth/api/users | `email` | `password`, `displayName`, `firstName`, `lastName`, `status`, `emailVerified` | email unique | CA `write` **+ admin** | 201; admin user creation (Directory action); random password when omitted |
| POST | /auth/api/users/import | `users[]` (`email` per row) | per-row `displayName`, `firstName`, `lastName`, `status`, `password` | ≤500 rows; email format | CA `write` **+ admin** | bulk create; per-row outcomes { created / skipped / failed } |
| GET | /auth/api/users/export | — | — | — | CA `read` **+ admin** | CSV download of the full user directory |
| GET | /auth/api/users/directory | — | `limit`, `offset`, `search` | `limit`≤100 | CA `read` (any authed) | public people directory; **safe fields only** (id, displayName, avatarUrl, bio); active users; search=displayName only |
| POST | /auth/api/users/profiles | `ids[]` | — | ids de-duped, capped 200 | CA `read` (any authed) | batch public profiles (id, displayName, avatarUrl, bio); active users only; resolves member/display names without N+1 |
| GET | /auth/api/users/:id | `id` | — | — | CA `read`; own or admin | full record; own-or-admin |
| GET | /auth/api/users/:id/profile | `id` | — | — | CA `read` (any authed) | public profile projection (id, displayName, avatarUrl, bio, createdAt); 404 if non-active |
| PUT | /auth/api/users/:id | `id` | `displayName`, `firstName`, `lastName`, `bio`, `avatarUrl` | — | CA `update`; own only | — |
| DELETE | /auth/api/users/:id | `id` | — | — | CA `delete`; own only | status→inactive |
| GET | /auth/api/users/:id/groups | `id` | — | — | CA `read`; own or admin | — |
| GET | /auth/api/users/:id/detail | `id` | — | — | CA `read` **+ admin** | admin inspector aggregate: safe user + groups + roles + org memberships (member role/status) + resolved permissions + last 10 sessions |
| GET | /auth/api/groups | — | `organizationId` | — | CA `read` | list; `organizationId` scopes to one org |
| POST | /auth/api/groups | `name` | `description`, `permissions`, `parentId`, `organizationId` | — | CA `write` | 201; slug derived from name; `organizationId`→org-scoped |
| POST | /auth/api/groups/import | `groups[]` (`name` per row) | per-row `description`, `organizationId`, `permissions`, `parentId` | ≤500 rows | CA `write` (router admin-gated) | bulk create; per-row outcomes { created / skipped / failed } |
| GET | /auth/api/groups/:id | `id` | — | — | CA `read` | — |
| PUT | /auth/api/groups/:id | `id` | `name`, `description`, `permissions` | — | CA `update` | — |
| DELETE | /auth/api/groups/:id | `id` | — | — | CA `delete` | — |
| POST | /auth/api/groups/:id/members | `id`, `userId` | `role` | — | CA `write` | `role='member'`; 201 |
| DELETE | /auth/api/groups/:id/members/:userId | `id`, `userId` | — | — | CA `delete` | — |
| POST | /auth/api/tokens/generate | — | `permissions`, `resourceType`, `resourceValue`, `expiryType`, `expirySeconds` | — | CA `read` | — |
| POST | /auth/api/tokens/validate | `token` | `requiredPermissions`, `resource` | — | Public | — |
| POST | /auth/api/tokens/revoke | `tokenId` | `reason` | — | CA `delete` | — |
| GET | /auth/api/oauth2/authorize | `client_id`, `response_type`, `redirect_uri` (PKCE for public) | `state`, `scope`, `code_challenge`, `code_challenge_method` | method=`S256` | Session | — |
| POST | /auth/api/oauth2/authorize | consent form fields; PKCE | `state`, `code_challenge`, `code_challenge_method` | method=`S256` | Session | — |
| POST | /auth/api/oauth2/token | `grant_type`, `code`/`refresh_token`; `code_verifier` if PKCE | client creds | — | OAuth2 client auth | token_type `Bearer` |
| POST | /auth/api/oauth2/revoke | `token` | — | — | OAuth2 client auth | always 200 |
| GET | /auth/api/oauth2/userinfo | Bearer access token | — | — | Bearer (OIDC) | (shadows oauth2.js) |
| POST | /auth/api/oauth2/introspect | `token` | `token_type_hint` | — | Public | `{active:false}` if missing |
| GET | /auth/api/saml/metadata | — | `idp` | — | Public (503 if disabled) | `idp='default'`; XML |
| GET | /auth/api/saml/login | — | `idp`, `redirect`, `additionalParams` | — | Public (503 if disabled) | `idp='default'`, `redirect='/'` |
| POST | /auth/api/saml/callback | `SAMLResponse` | — | — | Public ACS | MFA→mfaToken else exchange code |
| GET | /auth/api/saml/logout | — | `idp` | — | Session (503 if disabled) | `idp='default'` |
| POST | /auth/api/saml/logout/callback | `SAMLResponse` | `idp` | — | Public SLS | `idp='default'` |
| GET | /auth/api/saml/providers | — | — | — | Public (503 if disabled) | — |
| GET | /auth/api/saml/status | — | — | — | Public | — |
| POST | /auth/api/organizations | org fields (e.g. `name`) | — | — | Session | 201; ownerId=req.user.id |
| GET | /auth/api/organizations | — | `include=counts` | — | Session | user's orgs; `include=counts` adds `{ groups, users, violations }` per org (violations = members' moderation items rejected/flagged/escalated; best-effort cross-schema) |
| GET | /auth/api/organizations/:id | `id` | `include_members`, `include_groups`, `include_applications` | — | Session; member or `org:read` | includes default false |
| PATCH | /auth/api/organizations/:id | `id` | org fields | — | Session; owner/admin | — |
| DELETE | /auth/api/organizations/:id | `id` | — | — | Session; owner | — |
| GET | /auth/api/organizations/:id/members | `id` | `status`, `role` | — | Session; member | — |
| POST | /auth/api/organizations/:id/members | `id`, `userId` | `role` | — | Session; owner/admin | 201 |
| DELETE | /auth/api/organizations/:id/members/:userId | `id`, `userId` | — | — | Session; owner/admin or self | — |
| PATCH | /auth/api/organizations/:id/members/:userId | `id`, `userId`, `role` | — | — | Session; owner/admin | — |
| POST | /auth/api/organizations/:id/transfer-ownership | `id`, `newOwnerId` | — | — | Session | — |
| POST | /auth/api/applications | `organizationId` (+app fields) | — | — | Session; org owner/admin | 201 |
| GET | /auth/api/applications | — | `organizationId` | — | Session; org member | order createdAt DESC |
| GET | /auth/api/applications/:id | `id` | — | — | Session; org member | — |
| PATCH | /auth/api/applications/:id | `id` | app fields | — | Session; owner or org admin | strips clientId/Secret/orgId |
| DELETE | /auth/api/applications/:id | `id` | — | — | Session; owner or org admin | — |
| POST | /auth/api/applications/:id/regenerate-secret | `id` | — | — | Session; owner | new 32-byte hex |
| GET | /auth/api/applications/:id/check-access | `id` | `userId` | — | Session | `userId`=req.user.id |
| GET | /auth/api/roles | — | `organizationId`, `type` | — | Session; org member if scoped | order priority DESC |
| POST | /auth/api/roles | role fields | `organizationId` | — | Session; org admin or `*` perm | 201 |
| GET | /auth/api/roles/:id | `id` | — | — | Session; org member if scoped | — |
| PATCH | /auth/api/roles/:id | `id` | role fields | — | Session; not isSystem | — |
| DELETE | /auth/api/roles/:id | `id` | — | — | Session; not isSystem | — |
| POST | /auth/api/roles/:id/assign-user | `id`, `userId` | `organizationId`, `applicationId`, `expiresAt` | — | Session | 201 |
| POST | /auth/api/roles/:id/revoke-user | `id`, `userId` | `organizationId`, `applicationId` | — | Session | — |
| POST | /auth/api/roles/:id/assign-group | `id`, `groupId` | `organizationId`, `applicationId` | — | Session | 201 |
| POST | /auth/api/roles/:id/revoke-group | `id`, `groupId` | `organizationId`, `applicationId` | — | Session | — |
| GET | /auth/api/roles/permissions | — | `scope`, `service` | — | Session | order permissionString ASC |
| POST | /auth/api/roles/permissions | `permissionString` or `resource`+`action` | `scope`, `service`, `description` | unique permissionString | Session; platform admin or `*` perm | 201; defines a catalog entry (never isSystem) |
| GET | /auth/api/roles/:id/assignments | `id` | — | — | Session; org member if scoped | role's user assignments + group bindings with resolved user/group summaries |
| GET | /auth/api/roles/users/:userId/permissions | `userId` | `organizationId`, `applicationId` | — | Session | — |
| POST | /auth/api/roles/check-permission | `permission` | `userId`, `organizationId`, `applicationId`, `serviceName` | — | Session | `userId`=req.user.id |
| POST | /auth/api/roles/check-service-access | `serviceName` | `userId`, `organizationId`, `applicationId` | — | Session | `userId`=req.user.id |
| GET | /auth/api/config/:sectionId | `sectionId`∈auth-users/auth-groups/auth-roles/auth-methods | — | — | **none (public)** | 404 if unknown section |
| POST | /auth/api/config/:sectionId | `sectionId`; config data | — | — | **none (public)** | 404 if unknown section |

---

## Spark module (prefix /spark)

`validateCAToken({requiredPermissions})` for conversations/messages; `requireAuth` (populates
`req.user`) for attachments/enhanced/queues/encryption. `health` and `config` have no auth.
Pagination: `page`≥1 (default 1), `limit` 1–100 (default 20). `enhanced.js` mounts at `/spark/api`
adding `/forward`, `/pin`, `/settings`, etc.

### REST endpoints

| Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| POST | /spark/api/conversations | `type`, `participantIds` | `name` | — | CA `write` | creator=owner, others=member |
| GET | /spark/api/conversations | — | `limit`, `offset` | — | CA `read` | `limit=20`, `offset=0`; order lastMessageAt DESC |
| GET | /spark/api/conversations/:id | `id` | — | — | CA `read` (participant) | — |
| PUT | /spark/api/conversations/:id | `id` | `name`, `description`, `settings` | — | CA `update`; admin/owner | settings merged |
| DELETE | /spark/api/conversations/:id | `id` | — | — | CA `read` (participant) | soft-leave |
| POST | /spark/api/conversations/:id/participants | `id`, `userId` | — | — | CA `write`; admin/owner | new role `member`; emits participant:added |
| GET | /spark/api/messages/:conversationId | `conversationId` | `page`, `limit`, `before`, `after` | limit 1–100 | CA `read` (participant) | `page=1`, `limit=20`; order createdAt DESC |
| GET | /spark/api/messages/:conversationId/:messageId | `conversationId`, `messageId` | — | — | CA `read` (participant) | includes reactions+replies |
| PUT | /spark/api/messages/:conversationId/:messageId | `conversationId`, `messageId`, `content` | — | — | CA `update`; sender | emits message:edited |
| DELETE | /spark/api/messages/:conversationId/:messageId | `conversationId`, `messageId` | — | — | CA `delete`; sender | soft delete |
| GET | /spark/api/messages/:conversationId/search | `conversationId`, `q` | `limit` | — | CA `read` (participant) | `limit=20` |
| GET | /spark/api/messages/search/suggestions | `q` | `conversationId`, `limit` | `q` ≥2 | CA `read` | `limit=10` |
| POST | /spark/api/attachments/upload | multipart `file`, `messageId` | `conversationId` | file ≤100 MB; rate-limited | requireAuth; participant | video/audio queued |
| GET | /spark/api/attachments/:id | `id` | — | — | requireAuth; participant | — |
| GET | /spark/api/attachments/:id/download | `id` | — | — | requireAuth; participant | signed URL expiresIn=3600s |
| DELETE | /spark/api/attachments/:id | `id` | — | — | requireAuth; sender | — |
| GET | /spark/api/attachments/conversations/:conversationId/attachments | `conversationId` | `type`, `limit`, `offset` | — | requireAuth; participant | `limit=50`, `offset=0` |
| POST | /spark/api/queues/:name/clean | `name` | `grace` | — | requireAuth; **admin** | `grace=3600000` |
| GET | /spark/api/queues/stats | — | — | — | requireAuth; admin | — |
| GET | /spark/api/queues/:name/stats | `name` | — | — | requireAuth; admin | 404 if unknown |
| POST | /spark/api/queues/:name/pause, /resume | `name` | — | — | requireAuth; admin | — |
| POST | /spark/api/encryption/keys/generate | `deviceId` + (`publicKey`+`encryptedPrivateKey`) xor `passwordHash` | — | `deviceId` 1–255; `publicKey` ≤16384; `encryptedPrivateKey` ≤65536; `passwordHash` ≥32; 5/15min | requireAuth | client keypair = E2EE |
| GET | /spark/api/encryption/keys/public/:userId | `userId`(UUID) | — | UUID | requireAuth | 404 if none |
| POST | /spark/api/encryption/keys/public/batch | `userIds`(array) | — | 1–100 UUIDs | requireAuth | — |
| GET | /spark/api/encryption/keys/my-keys | — | — | — | requireAuth | all devices |
| GET | /spark/api/encryption/keys/mine | — | — | — | requireAuth; owner | opaque blob |
| PUT | /spark/api/encryption/keys/:keyId/rotate | `keyId`, `oldPasswordHash`, `newPasswordHash` | — | hashes ≥32; 3/hr | requireAuth; owner | 401 invalid old |
| DELETE | /spark/api/encryption/keys/:keyId | `keyId` | — | — | requireAuth; owner | deletes device keys |
| POST | /spark/api/encryption/messages/:messageId/keys | `messageId`, `recipientKeys`(array `{userId,encryptedKey}`) | — | array ≥1 | requireAuth; sender | — |
| GET | /spark/api/encryption/messages/:messageId/keys | `messageId` | — | — | requireAuth; participant | 404 if none |
| POST | /spark/api/messages/:id/forward | `id`, `conversationIds`(array) | `content` | array non-empty | requireAuth; participant src+targets | emits message:new |
| POST | /spark/api/messages/:id/pin, /unpin | `id` | — | — | requireAuth; owner/admin | emits message:pinned/unpinned |
| GET | /spark/api/conversations/:id/pinned | `id` | — | — | requireAuth; participant | order pinnedAt DESC |
| GET | /spark/api/messages/:id/thread | `id` | `limit`, `offset` | — | requireAuth; participant | `limit=50`, `offset=0` |
| POST | /spark/api/messages/:id/reply | `id`, `content` | `contentType` | — | requireAuth; participant | `contentType='text'` |
| PUT | /spark/api/conversations/:id/settings | `id` | `muted`, `muteUntil`, `notificationsEnabled` | — | requireAuth; participant | — |
| GET | /spark/api/conversations/:id/settings | `id` | — | — | requireAuth; participant | notificationsEnabled default true |
| POST | /spark/api/conversations/:id/mute | `id` | `until` | — | requireAuth; participant | muteUntil=until\|null |
| POST | /spark/api/conversations/:id/unmute | `id` | — | — | requireAuth; participant | — |
| GET | /spark/api/groups/:groupId/channels | `groupId` | — | — | CA `read`; group member | list/auto-provision a group's chat + announcement channels |
| POST | /spark/api/groups/:groupId/channels/:channelKind/messages | `groupId`, `channelKind`, `content` | — | — | CA `write`; group member (announcement→admin/owner) | post a plaintext message to a group channel |
| GET | /spark/health, /health/db, /health/ca | — | — | — | none | 503 if down |
| GET | /spark/api/config/:sectionId | `sectionId`∈messaging-settings/messaging-moderation | — | — | none | 404 unknown |
| POST | /spark/api/config/:sectionId | `sectionId`; config | — | — | none | runtime only |

### Socket.IO events (namespace /spark)

Namespace `io.use` runs `validateSocketToken` against CA (`requiredPermissions {read:true}`); failure
rejects the connection. `send:message`/`edit:message` need `write`; `delete:message` needs `delete`.
For group-bound conversations, `join:conversation` and `send:message` additionally enforce live nexus
group membership; sends to the announcement channel require admin/owner.

| Event | Direction | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| join:conversation | client→server | `conversationId` | — | — | namespace + participant | emits joined/error |
| leave:conversation | client→server | `conversationId` | — | — | namespace | emits left |
| send:message | client→server | `conversationId`, `content`/`encryptedContent` | `contentType`, `parentMessageId`, `attachments`, `mentions`, `encrypted`, `senderKeyFingerprint`, `recipientKeys` | — | namespace + `write`; participant | `contentType='text'`, `attachments=[]`, `mentions=[]` |
| typing:start / stop | client→server | `conversationId` | — | — | namespace; participant | auto-clear after timeout |
| mark:read | client→server | `conversationId`, `messageId` | — | — | namespace; participant | emits read:receipt |
| add:reaction | client→server | `messageId`, `emoji` | — | — | namespace | emits new:reaction |
| edit:message | client→server | `messageId`, `content`/`encryptedContent` | `senderKeyFingerprint`, `recipientKeys` | — | namespace + `write`; sender | emits message:edited |
| delete:message | client→server | `messageId` | — | — | namespace + `delete`; sender | content→`[deleted]` |
| presence:update | client→server | `status` | — | status∈online/away/busy/offline | namespace | emits user:status |
| new:message | server→client | message JSON + `sender{id,displayName}` | — | — | — | displayName default 'User' |
| typing:start / stop | server→client | `conversationId`, `userId` (+`displayName`) | — | — | — | — |
| read:receipt | server→client | `conversationId`, `messageId`, `userId` | — | — | — | — |
| new:reaction | server→client | `messageId`, `userId`, `emoji`, `created` | — | — | — | — |
| message:edited | server→client | `messageId`, content fields, `editedAt` | — | — | — | — |
| message:deleted | server→client | `messageId`, `deletedAt` | — | — | — | — |
| user:status | server→client | `userId`, `status`, `updatedAt` | — | — | — | — |
| error | server→client | `event`, `message` | — | — | — | on handler failure |
| participant:added / message:new / message:pinned / message:unpinned / message:reply | server→client (from REST) | varies | — | — | — | emitted by REST routes |

---

## Nexus module (prefix /nexus)

`requireToken(opts)` = CA token (cached 5 min); `optionalToken` = token optional; `validateGroup`,
`requireGroupMember`, `requireGroupAdmin`, `requireAdmin()` add checks. **Caveat:** several routers pass
`requireToken`/`optionalToken` as a bare reference (not invoked) — documented as "token" intent.
No Socket.IO. Global rate limiter on `/nexus/api/*`.

**Platform-admin override:** `requireToken` now surfaces the CA-token RBAC roles
(`req.userId`/`req.userRoles`, from token `data.roles`). A verified platform admin
(role `admin`) bypasses `requireGroupMember`/`requireGroupAdmin` **without** a
membership row (`req.isPlatformAdmin` is set), and the corresponding service-layer
re-checks are bypassed too. Applies to: group edit/delete, member remove + role
change, event update/cancel/delete, and subgroup update/delete/add-member/remove-member.
(Governance `execute`/`close` and event `notify` carry no per-user group gate, so a
platform admin — like any authenticated caller — already passes.)

**Internal (service-to-service) endpoints** under `/nexus/api/internal/*` require a
per-service HMAC credential (`X-Service-ID` + `X-Service-Token` =
HMAC-SHA256(serviceId, `SERVICE_TOKEN_SECRET`)); they reject end-user CA tokens.
Used by the shared `requireGroupMembership()` guard so other modules can authorize
against group membership.

### REST endpoints

| Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| GET | /nexus/health[/db,/cache,/all] | — | — | — | none | — |
| POST | /nexus/api/groups | `name` | description, visibility, joinMode, governanceModel, governanceRules, category, tags[], avatarUrl, bannerUrl, maxMembers, location, latitude, longitude, website, metadata | name 2–255; description ≤5000; category ≤100; tag ≤50; url ≤500; maxMembers ≥1; lat −90..90 & lng −180..180 (both-or-neither) | token (write) | visibility=public, joinMode=request, governanceModel=centralized, tags=[], metadata={} |
| GET | /nexus/api/groups | — | visibility, category, tags, search, featured, verified, creatorId, page, limit, sortBy, sortOrder | limit ≤100 | none | page=1, limit=20, sortBy=createdAt, sortOrder=DESC |
| POST | /nexus/api/groups/search | — | query, category, tags, location, minMembers, maxMembers, governanceModel, visibility, joinMode, isFeatured, isVerified, page, limit, sortBy, sortOrder | limit ≤100 | none | page=1, limit=20, sortBy=relevance |
| GET | /nexus/api/groups/discover/nearby | `lat`, `lng` | radius, limit, offset | limit ≤100 | none | radius=50, limit=20, offset=0 |
| GET | /nexus/api/groups/discover/activity | — | categories, limit | limit ≤100 | none | limit=50 |
| GET | /nexus/api/groups/search/popular | — | limit | limit ≤50 | none | limit=10 |
| GET | /nexus/api/groups/:id | `id` | — | — | validateGroup (optional user) | — |
| GET | /nexus/api/groups/:id/related | `id` | depth | depth ≤3 | validateGroup | depth=2 |
| PUT | /nexus/api/groups/:id | `id` | create fields (optional), incl. latitude/longitude | name 2–255; lat/lng ranges & both-or-neither | token (update)+member+admin | — |
| DELETE | /nexus/api/groups/:id | `id` | — | — | token (delete)+member | — |
| GET | /nexus/api/groups/:id/members | `id` | role, status, page, limit | limit ≤100 | validateGroup+member | status=active, page=1, limit=50 |
| POST | /nexus/api/groups/:id/join | `id` | message, inviteCode | — | token (write)+validateGroup | — |
| POST | /nexus/api/groups/:id/leave | `id` | — | — | token+validateGroup+member | — |
| DELETE | /nexus/api/groups/:id/members/:userId | `id`, `userId` | reason | — | token (delete)+member+admin | — |
| POST | /nexus/api/groups/:id/invite | `id` | userId, message, maxUses, expiresAt | — | token (write)+member | — |
| POST | /nexus/api/groups/:id/join-requests/:requestId/approve | `id`, `requestId` | — | — | token (write)+member+admin | — |
| POST | /nexus/api/groups/:id/join-requests/:requestId/reject | `id`, `requestId` | reason | — | token (write)+member+admin | — |
| GET | /nexus/api/memberships | — | status, role, page, limit | page ≥1; limit 1–100 | token | status=active, page=1, limit=50 |
| GET | /nexus/api/memberships/user/:userId | `userId` | page, limit | page ≥1; limit 1–100 | token (any authed) | another user's **public-visibility** group memberships only |
| POST | /nexus/api/events | `groupId`, `title`, `eventType`, `startTime` | description, location, virtualUrl, endTime, timezone, maxAttendees, rsvpDeadline, requiresApproval, visibility, coverImageUrl, tags, metadata | title 2–255; startTime ≥now; endTime ≥startTime; maxAttendees ≥1; url ≤500 | token | timezone=UTC, requiresApproval=false, visibility=members-only |
| GET | /nexus/api/events | (groupId if anon) | groupId, upcoming, past, status, eventType, limit, offset | — | optionalToken | limit=50, offset=0 |
| GET | /nexus/api/events/:id | `id` | — | — | optionalToken | — |
| PUT | /nexus/api/events/:id | `id`; ≥1 field | event fields | title 2–255; ≥1 field | token | — |
| POST | /nexus/api/events/:id/cancel | `id` | reason | — | token | — |
| DELETE | /nexus/api/events/:id | `id` | — | — | token | — |
| POST | /nexus/api/events/:id/rsvp | `id` | rsvpStatus, guestCount, notes | guestCount 0–10; notes ≤500 | token | rsvpStatus=going, guestCount=0 |
| DELETE/GET | /nexus/api/events/:id/rsvp | `id` | — | — | token | — |
| GET | /nexus/api/events/:id/attendees | `id` | rsvpStatus, checkInStatus, limit, offset | — | optionalToken | limit=100, offset=0 |
| POST | /nexus/api/events/:id/check-in/:userId | `id`, `userId` | — | — | token (admin intent) | — |
| POST/PUT | /nexus/api/events/:id/reminders | `id`, `reminderTimes[]` | — | 1–6 preset items | token | DEFAULT_REMINDER_SCHEDULE |
| DELETE | /nexus/api/events/:id/reminders | `id` | — | — | token | — |
| POST | /nexus/api/events/:id/notify | `id`, `updateType`, `message` | — | — | token (admin intent) | — |
| POST | /nexus/api/events/:id/live | `id` | liveStreamId | liveStreamId null to unlink | token + event creator/group owner-admin (platform-admin bypass) | link/unlink a live Stream to a group event |
| GET | /nexus/api/events/reminders/presets | — | — | — | none | — |
| POST | /nexus/api/governance/proposals | `groupId`, `title`, `description`, `proposalType` | votingMethod, quorumRequired, votingStartsAt, votingEndsAt, votingDuration, actionData, metadata | title 5–255; quorum 1–100; votingDuration 1h–30d | token | — |
| GET | /nexus/api/governance/proposals | `groupId` | status, proposalType, activeOnly, limit, offset | — | token | limit=50, offset=0 |
| GET | /nexus/api/governance/proposals/:id | `id` | — | — | token | — |
| PUT | /nexus/api/governance/proposals/:id | `id` | title, description, proposalType, quorumRequired, votingEndsAt, actionData, metadata | ≥1 field; proposer-only, only while draft/active with no votes | token | — |
| DELETE | /nexus/api/governance/proposals/:id | `id` | — | proposer-only, only while draft/active; soft-cancels (status=cancelled) | token | — |
| POST | /nexus/api/governance/proposals/:id/vote | `id`, `vote` | weight, reason | vote∈yes/no/abstain; weight ≥0; reason ≤1000 | token | — |
| GET | /nexus/api/governance/proposals/:id/results | `id` | — | — | token | — |
| GET | /nexus/api/governance/proposals/:id/votes | `id` | vote, limit, offset | — | token | limit=100, offset=0 |
| POST | /nexus/api/governance/proposals/:id/execute | `id` | — | proposal must be `passed` and not yet executed; applies role/member/rule action | token (admin intent) | — |
| POST | /nexus/api/governance/proposals/:id/close | `id` | — | — | token (admin intent) | — |
| GET | /nexus/api/trending/groups | — | category, limit, offset, minScore | limit ≤100 | optionalToken | limit=20, offset=0, minScore=0 |
| POST | /nexus/api/trending/update | — | groupId, limit, batchSize | — | token + requireAdmin() | limit=1000, batchSize=50 |
| GET | /nexus/api/recommendations | — | limit, refresh, excludeDismissed | limit ≤50 | token | limit=20, refresh=false, excludeDismissed=true |
| POST | /nexus/api/recommendations/generate | — | limit, minScore | limit ≤50 | token | limit=20, minScore=10 |
| POST | /nexus/api/recommendations/:id/track | `id`, `action` | metadata | action∈shown/clicked/joined/dismissed | token | metadata={} |
| GET | /nexus/api/recommendations/analytics | — | — | — | token | — |
| POST | /nexus/api/moderation/flags | `groupId`, `contentType`, `contentId`, `flagReason` | contentOwnerId, description, evidence | description ≤1000; enums | token | evidence={} |
| GET | /nexus/api/moderation/flags/:groupId | `groupId` | status, priority, limit, offset | limit ≤100 | token + moderator | status=pending, offset=0 |
| GET | /nexus/api/moderation/queue/:groupId | `groupId` | status, priority, limit, offset | limit ≤100 | token + moderator | status=[open,under-review] |
| GET | /nexus/api/moderation/cases/:id | `id` | — | — | token + moderator | — |
| POST | /nexus/api/moderation/cases/:id/action | `id`, `actionType`, `reason` | duration | reason ≤500; duration ≥0 | token + moderator | — |
| POST | /nexus/api/moderation/cases/:id/assign | `id`, `moderatorIds[]` | — | array non-empty | token + moderator | — |
| POST | /nexus/api/moderation/flags/:flagId/resolve | `flagId`, `resolution` | reason | resolution∈dismiss/escalate | token + group moderator/admin or platform admin | resolve a flag |
| GET | /nexus/api/admin/stats | — | period, days | period∈7d/30d/90d | token + requireAdmin() (platform admin) | platform totals + growth series |
| GET | /nexus/api/admin/groups/:id/stats | `id` | period, days | period∈7d/30d/90d | token + requireAdmin() (platform admin) | per-group totals, member/event/flag growth, recent activity |
| GET | /nexus/api/admin/audit | — | actor, action, targetType, groupId, limit, offset | — | token + requireAdmin() (platform admin) | admin audit log; newest-first |
| GET | /nexus/api/calendar/events/:id/ical | `id` | — | — | optionalToken | text/calendar |
| GET | /nexus/api/calendar/groups/:groupId/ical | `groupId` | upcoming, limit | limit ≤500 | optionalToken | upcoming=true, limit=100 |
| GET | /nexus/api/calendar/users/:userId/ical | `userId` (=token user) | upcoming, limit | limit ≤500 | token (self) | upcoming=true, limit=100 |
| GET | /nexus/api/calendar/caldav/... , /carddav/... | per route | sync/timeRange/format | — | token (self) / optionalToken | format=json |
| POST | /nexus/api/subgroups | `parentGroupId`, `name` | description, type, visibility, inheritPermissions, permissions, allowedRoles, category, tags, avatarUrl, bannerUrl, maxMembers, sortOrder, settings, metadata | name 2–255; category ≤100; maxMembers ≥1 | token | type=channel, visibility=members, inheritPermissions=true, sortOrder=0 |
| GET | /nexus/api/subgroups | `parentGroupId` | type, visibility, includeArchived | — | optionalToken | — |
| GET | /nexus/api/subgroups/:id | `id` | — | — | optionalToken | — |
| PUT | /nexus/api/subgroups/:id | `id`; ≥1 field | subgroup fields | name 2–255 | token | — |
| DELETE | /nexus/api/subgroups/:id | `id` | — | — | token | — |
| POST | /nexus/api/subgroups/:id/members | `id`, `userId` | role | role∈moderator/member | token | role=member |
| DELETE | /nexus/api/subgroups/:id/members/:userId | `id`, `userId` | — | — | token | — |
| GET | /nexus/api/subgroups/:id/access | `id` | — | — | token | — |
| GET/POST | /nexus/api/config/:sectionId | `sectionId`∈nexus-groups/events/calendar/trending | — | — | token + requireAdmin() | 404 if unknown section |
| GET | /nexus/api/internal/groups/:id/membership/:userId | `id`, `userId` | — | — | **service HMAC** (X-Service-ID/X-Service-Token) | `{ isMember, role, visibility, joinMode }`; 404 if group missing |

## Filevault module (prefix /filevault)

`authenticate` = CA bearer (header or `token` cookie; no query-string tokens) → `req.userId`/`req.permissions`.
`requirePermissions({...})` checks read/write/delete/admin. Share-link GETs are unauthenticated (UUID is
the capability). Upload: single field `file`, ≤`config.app.maxFileSize`. `validateUUID` enforces UUID v4.
No Socket.IO.

### REST endpoints

| Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| POST | /filevault/api/files/upload | multipart `file` | path, directoryId, tags, metadata | file ≤ maxFileSize; 1 file | authenticate + write | directoryId=null, tags=[], metadata={} |
| GET | /filevault/api/files | — | directoryId, limit, offset, tags | — | authenticate | limit=50, offset=0, tags=[] |
| GET | /filevault/api/files/trash | — | limit, offset | — | authenticate | caller's soft-deleted user-owned files, newest-deleted first; limit=50, offset=0 |
| GET | /filevault/api/files/:fileId | `fileId`(UUID) | — | UUID v4 | authenticate | — |
| GET | /filevault/api/files/:fileId/download | `fileId`(UUID) | version | UUID v4 | authenticate + read | latest version |
| PUT | /filevault/api/files/:fileId | `fileId`(UUID); multipart `file` | changeDescription | UUID v4; file ≤ maxFileSize | authenticate + write | — |
| DELETE | /filevault/api/files/:fileId | `fileId`(UUID) | — | UUID v4 | authenticate + delete | — |
| GET | /filevault/api/files/:fileId/versions | `fileId`(UUID) | — | UUID v4 | authenticate | — |
| POST | /filevault/api/files/:fileId/restore | `fileId`(UUID) | — | UUID v4 | authenticate + write (owner) | undelete a soft-deleted file |
| POST | /filevault/api/files/:fileId/restore/:versionNumber | `fileId`(UUID), `versionNumber` | — | UUID v4 | authenticate + write | — |
| GET | /filevault/api/files/:fileId/diff | `fileId`(UUID), `from`, `to` | — | UUID v4 | authenticate | — |
| POST | /filevault/api/directories | `name` | parentId | — | authenticate + write | parentId=null |
| GET | /filevault/api/directories | — | directoryId | — | authenticate | directoryId=null (root) |
| GET | /filevault/api/directories/:directoryId | `directoryId`(UUID) | — | UUID v4 | authenticate | — |
| PUT | /filevault/api/directories/:directoryId/rename | `directoryId`(UUID), `name` | — | UUID v4 | authenticate + write | — |
| PUT | /filevault/api/directories/:directoryId/move | `directoryId`(UUID) | newParentId | UUID v4 | authenticate + write | newParentId=null |
| DELETE | /filevault/api/directories/:directoryId | `directoryId`(UUID) | recursive | UUID v4 | authenticate + delete | recursive=false |
| GET | /filevault/api/groups/:groupId/files | `groupId` | directoryId, images, mimetype, tags, limit, offset | — | authenticate + group member | list a group's files |
| POST | /filevault/api/groups/:groupId/files/upload | `groupId`; multipart `file` | path, directoryId, tags, metadata | file ≤ maxFileSize; 1 file | authenticate + write + group member | multipart upload into a group |
| GET | /filevault/api/groups/:groupId/directories | `groupId` | directoryId | — | authenticate + group member | list a group's directories + files (directoryId = parent) |
| GET | /filevault/api/thumbnails/:fileId | `fileId`(UUID) | size | UUID v4; size∈small/medium/large | authenticate + (group member for group files / owner\|shared\|public for user files) | streams thumbnail bytes (image/jpeg) |
| POST | /filevault/api/share/files/:fileId/share | `fileId`(UUID) | permissions, expiresIn, maxUses | UUID v4 | authenticate (owner) | — |
| GET | /filevault/api/share/files/:fileId/shares | `fileId`(UUID) | — | UUID v4 | authenticate (owner) | — |
| GET | /filevault/api/share | — | limit, offset | — | authenticate | limit=50, offset=0 |
| POST | /filevault/api/share/files/:fileId/access-token | `fileId`(UUID) | expiresIn, permissions | UUID v4 | authenticate (owner) | mint a file-scoped CA access token; returns `{tokenId, expiresAt, downloadUrl}` |
| GET | /filevault/api/share/file/:fileId/download | `fileId`(UUID), `token`(query) | — | UUID v4 | **none — file-scoped CA token in ?token=** | direct token download (no share-link row); token must be valid + scoped to fileId |
| GET | /filevault/api/share/:shareLinkId | `shareLinkId`(UUID), `token`(query) | — | UUID v4 | **none — but `?token=` must match the link's CA token** | metadata only (does not consume a use) |
| GET | /filevault/api/share/:shareLinkId/download | `shareLinkId`(UUID), `token`(query) | — | UUID v4 | **none — but `?token=` must match the link's CA token** | consumes a use |
| DELETE | /filevault/api/share/:shareLinkId | `shareLinkId`(UUID) | — | UUID v4 | authenticate (owner) | — |
| GET | /filevault/api/search | `q` | limit, offset | — | authenticate | limit=50, offset=0 |
| GET | /filevault/api/search/tag/:tag | `tag` | limit, offset | — | authenticate | limit=50, offset=0 |
| GET | /filevault/api/storage/usage | — | — | — | authenticate | — |
| GET | /filevault/api/storage/quota | — | — | — | authenticate | quota=10GB (hard-coded) |
| GET | /filevault/api/admin/stats, /deduplication, /duplicates | — | — | — | authenticate + admin | — |
| POST | /filevault/api/admin/cleanup[/blobs] | — | minAge | — | authenticate + admin | minAge=86400000 |
| GET | /filevault/api/admin/quotas | — | limit | — | authenticate + admin | limit=100 |
| PUT | /filevault/api/admin/quotas/:userId | `userId`, `quotaBytes` | — | quotaBytes ≥0 | authenticate + admin | — |
| POST | /filevault/api/admin/migrate | `fileIds[]`, `toBackend` | deleteSource | fileIds non-empty | authenticate + admin | deleteSource=true |
| POST | /filevault/api/admin/verify/:blobId | `blobId` | — | — | authenticate + admin | — |
| GET | /filevault/api/admin/storage/health | — | — | — | authenticate + admin | — |
| GET | /filevault/api/health[/db,/storage,/ready,/live] | — | — | — | none | — |
| OPTIONS | /filevault/webdav/* | — | — | — | none | DAV: 1,2 |
| PROPFIND/GET/PUT/DELETE/MKCOL/COPY/MOVE/LOCK/UNLOCK/HEAD | /filevault/webdav/* | path-derived resource (+ Destination/Lock-Token headers as needed) | Depth, Overwrite, If/Lock, Timeout headers | — | authenticate (+read/write/delete per method) | LOCK timeout=3600s, depth=0; dir COPY/MOVE→501 |

---

## Vault module (prefix /vault)

CA-token validation via `validateCAToken` + `enforceResourceScope`. `requireRead/Write/Delete/Admin(prefix)`
require the matching permission scoped to a resource prefix or 403. `/api/config` requires `admin`.
Per-route rate limits noted in Defaults.

### REST endpoints

| Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| GET | /vault/api/secrets/ | — | pathPrefix, status, limit, offset | — | read `/secrets` | 100/min |
| GET | /vault/api/secrets/:path(*) | `path` | includeValue | — | read `/secrets` | includeValue=true unless `"false"` |
| POST | /vault/api/secrets/:path(*) | `path`, `key`, `value` | encryptionKeyId, metadata, rotationPolicy, expiresAt | key 1–255 | write `/secrets` | 201; 20/15min |
| PUT | /vault/api/secrets/:path(*) | `path`; ≥1 of fields | value, metadata, rotationPolicy, expiresAt | body min 1 key | write `/secrets` | 20/15min |
| DELETE | /vault/api/secrets/:path(*) | `path` | — | — | delete `/secrets` | 20/15min |
| POST | /vault/api/secrets/:path(*)/rotate | `path` | newValue | — | write `/secrets` | 20/15min |
| GET | /vault/api/keys/ | — | status, purpose, limit, offset | — | read `/keys` | 100/min |
| GET | /vault/api/keys/:keyId | `keyId` | — | — | read `/keys` | — |
| POST | /vault/api/keys/generate | `name` | purpose, rotationSchedule, expiresAt, metadata | name 1–255; purpose∈general/transit/signing | write `/keys` | 201; purpose=general; 10/15min |
| POST | /vault/api/keys/encrypt | `keyId`(uuid), `plaintext` | — | — | write `/keys` | aes-256-gcm; 50/min |
| POST | /vault/api/keys/decrypt | `keyId`(uuid), `ciphertext`, `iv`, `authTag` | — | — | read `/keys` | 50/min |
| POST | /vault/api/keys/:keyId/rotate | `keyId` | — | — | write `/keys` | 10/15min |
| DELETE | /vault/api/keys/:keyId | `keyId` | — | — | delete `/keys` | 10/15min |
| GET | /vault/api/credentials/ | — | service, status, limit, offset | — | read `/credentials` | 100/min |
| GET | /vault/api/credentials/:service/:name | `service`, `name` | — | — | read `/credentials` | status=active |
| POST | /vault/api/credentials/:service/:name | `service`, `name`, `username`, `password` | metadata, ttl, renewable | username 1–255; ttl 60–31536000 | write `/credentials` | 201; metadata={}, ttl=31536000, renewable=true; 20/15min |
| PUT | /vault/api/credentials/:service/:name | — | — | — | write `/credentials` | always 501 |
| DELETE | /vault/api/credentials/:service/:name | `service`, `name` | — | — | delete `/credentials` | 20/15min |
| POST | /vault/api/credentials/database/generate | `database` | role, ttl, databaseType, connection | database 1–255; ttl 60–86400; type∈postgresql/mysql/mongodb | write `/credentials` | 201; ttl=3600, databaseType=postgresql; 20/15min |
| POST | /vault/api/dynamic/database | `path` | ttl, maxTTL, renewable, databaseType, connection | ttl 60–86400; maxTTL 60–604800 | write `/dynamic` | 201; ttl=3600, maxTTL=86400, renewable=true, databaseType=postgresql |
| POST | /vault/api/dynamic/api-key | `path` | ttl, maxTTL, renewable, prefix, scopes | ttl 60–86400; maxTTL 60–604800; prefix 1–10 | write `/dynamic` | 201; ttl=3600, maxTTL=86400, renewable=true, prefix=vlt, scopes=[] |
| GET | /vault/api/dynamic/leases | — | secretType, status, limit, offset | — | token `/dynamic` read | — |
| POST | /vault/api/dynamic/leases/:leaseId/renew | `leaseId` | increment | increment 60–86400 | write `/dynamic` | — |
| DELETE | /vault/api/dynamic/leases/:leaseId | `leaseId` | — | — | write `/dynamic` | — |
| GET | /vault/api/audit/logs | — | resourceType, resourceId, resourcePath, actor, action, success, startDate, endDate, limit, offset | limit 1–1000; offset ≥0 | token `/audit` read | limit=100, offset=0 |
| GET | /vault/api/audit/stats | — | startDate, endDate, actor, resourceType | — | token `/audit` read | — |
| GET | /vault/api/audit/export | — | resourceType, actor, startDate, endDate | — | token `/audit` read | CSV |
| POST | /vault/api/admin/tokens/generate | `displayName`, `entityType`, `entityId`, `permissions` | description, pathPrefixes, ipWhitelist, expiresAt, maxUses, policyIds, caIntegration, metadata | displayName 1–255; description ≤1000; entityType∈user/group/organization/service/certificate; maxUses ≥1 | write `/admin` | 201; 100/15min |
| GET | /vault/api/admin/tokens | — | entityType, entityId, status, limit, offset | — | read `/admin` | limit=50, offset=0 |
| GET | /vault/api/admin/tokens/:tokenId | `tokenId` | — | — | read `/admin` | — |
| POST | /vault/api/admin/tokens/:tokenId/revoke | `tokenId`, `reason` | — | — | write `/admin` | 400 if no reason |
| POST | /vault/api/admin/tokens/:tokenId/suspend | `tokenId` | reason | — | write `/admin` | — |
| POST | /vault/api/admin/tokens/:tokenId/reactivate | `tokenId` | — | — | write `/admin` | 400 if revoked |
| POST | /vault/api/admin/tokens/bulk/revoke | `tokenIds[]` OR `entityType`+`entityId` | reason | — | write `/admin` | 400 if neither |
| POST | /vault/api/admin/policies | `name`, `policyType`, `rules` | description, entityTypes, priority, enforcementMode | name 1–255; description ≤1000; policyType∈secret/key/credential/global; priority 1–1000; mode∈enforcing/permissive/audit | write `/admin` | 201; status=active |
| GET | /vault/api/admin/policies | — | policyType, status, aiSuggested | — | read `/admin` | order priority DESC |
| GET | /vault/api/admin/policies/:policyId | `policyId` | — | — | read `/admin` | — |
| PUT | /vault/api/admin/policies/:policyId | `policyId` | description, rules, priority, enforcementMode, status | — | write `/admin` | allowlist fields only |
| DELETE | /vault/api/admin/policies/:policyId | `policyId` | — | — | delete `/admin` | — |
| POST | /vault/api/admin/policies/suggest | `entityType`, `entityId` | — | — | read `/admin` | 400 if missing |
| GET | /vault/api/admin/dashboard/stats | — | — | — | read `/admin` | — |
| POST | /vault/api/admin/reports/access | — | startDate, endDate, entityType, entityId | — | read `/admin` | startDate=now-7d, endDate=now |
| GET | /vault/api/admin/tokens/:tokenId/anomalies | `tokenId` | — | — | read `/admin` | — |
| POST | /vault/api/admin/maintenance/purge | — | — | — | write `/admin` | — |
| POST | /vault/api/admin/maintenance/cache/clear | — | — | — | write `/admin` | — |
| GET | /vault/api/groups/:groupId/secrets | `groupId` | — | — | read + group member | list secrets shared with a group — METADATA ONLY (never plaintext/encryptedValue) |
| POST | /vault/api/groups/:groupId/secrets/:path(*)/share | `groupId`, `path`, `permission` | expiresAt | permission∈read/write/manage | write + group admin | grant the group access to an existing secret |
| DELETE | /vault/api/groups/:groupId/secrets/:path(*)/share | `groupId`, `path` | — | — | write + group admin | revoke the group's access |
| GET | /vault/api/groups/:groupId/secrets/:path(*)/reveal | `groupId`, `path` | — | — | read + group admin | explicit, audited reveal of one secret's plaintext (only group route returning plaintext); 403 NOT_SHARED if no live grant |
| GET | /vault/api/config/:sectionId | `sectionId`∈vault/vault-secrets/vault-encryption/vault-access/vault-audit | — | — | admin `/config` | 404 unknown |
| POST | /vault/api/config/:sectionId | `sectionId`; config | — | (vault not writable) | admin `/config` | 404 unknown |
| GET | /vault/health | — | — | — | none | static |

### Socket.IO events (namespace /vault)

Handshake requires `socket.handshake.auth.token`. In production validates CA token (`{read:true}`,
resource `/admin/*`); **in non-production any token bypasses validation** (dev user, all perms). On connect
socket joins room `admin`. Server emits target the `admin` room.

| Event | Direction | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| connected | server→client | — | — | — | post-auth | `{clientId, timestamp, message}` |
| subscribe / unsubscribe | client→server | channel-name array | — | must be Array | authed | joins/leaves rooms |
| ping | client→server | — | — | — | authed | replies `pong` |
| pong | server→client | `timestamp` | — | — | — | — |
| token:event | server→client (admin) | `event`, `data`, `timestamp` | — | — | — | created/revoked/suspended |
| policy:event | server→client (admin) | `event`, `data`, `timestamp` | — | — | — | — |
| security:alert | server→client (admin) | `type`, `tokenId`, `anomalies`, `severity`, `timestamp` | — | only on critical/high | — | severity='high' |
| stats:update / cache:stats | server→client (admin) | `stats`, `timestamp` | — | — | — | — |
| audit:log | server→client (admin) | `log`, `timestamp` | — | — | — | — |
| notification | server→client (admin) | notification + `timestamp` | — | — | — | — |
| server:shutdown | server→client (broadcast) | `reason`, `timestamp` | — | — | — | on shutdown |

---

## Timeline module (prefix /timeline)

Most routers begin with `requireToken({requiredPermissions:{read:true}, resourcePrefix})`; `requireWrite/Update/Delete`
add permissions. `/api/config` and `/api/webhooks` have no token middleware. `/api/interactions` reads
`req.user?.id` (401 if absent). Pagination: `page`≥1 default 1, `limit` 1–100 default 20; cursor routes default
`limit=20`, `direction=after`. Post length max 280.

### REST endpoints

| Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| POST | /timeline/api/posts/ | `content` | mediaIds, visibility, replyTo, quoteOf, groupId | content 1–4000; mediaIds ≤4; visibility∈public/followers/private | write `/posts` (+ requireGroupMembership() if groupId) | 201; visibility=public; private/unlisted groups force member-only visibility |
| GET | /timeline/api/posts/:id | `id`(uuid) | — | uuid | read `/posts` | 403 if private non-owner |
| PUT | /timeline/api/posts/:id | `id`(uuid), `content` | — | content 1–4000 | update `/posts` | — |
| DELETE | /timeline/api/posts/:id | `id`(uuid) | — | uuid | delete `/posts` | — |
| POST | /timeline/api/posts/:id/like | `id` | — | — | write (default `/timeline`) | — |
| DELETE | /timeline/api/posts/:id/like | `id` | — | — | read `/posts` | — |
| POST | /timeline/api/posts/:id/comments | `id`, `content` | — | — | write | 201 |
| GET | /timeline/api/posts/:id/comments | `id` | page, limit, offset | limit 1–100 | read `/posts` | page1, limit20 |
| GET | /timeline/api/posts/:id/thread, /quotes | `id`(uuid) | — | uuid | read `/posts` | — |
| GET | /timeline/api/posts/:id/analytics | `id`(uuid) | — | uuid | read `/posts` | 403 unless owner |
| POST | /timeline/api/posts/:id/approval | `id`(uuid), `decision` | `reason` | decision approved\|rejected | admin (`requireAdmin`) | manual decision for a post held by "Require Approval for New Posts"; approve restores requested visibility |
| POST | /timeline/api/posts/:id/repost | `id`(uuid) | comment | uuid | write `/posts` | — |
| DELETE | /timeline/api/posts/:id/repost | `id`(uuid) | — | uuid | read `/posts` | — |
| POST/DELETE | /timeline/api/posts/:id/bookmark | `id`(uuid) | — | uuid | read `/posts` | — |
| GET | /timeline/api/posts/:id/likes, /reposts | `id`(uuid) | page, limit, offset | limit 1–100 | read `/posts` | page1, limit20 |
| GET | /timeline/api/timeline/ | — | cursor, limit, direction, page, offset | limit ≤100 | read `/timeline` | cursor; limit20; direction after |
| GET | /timeline/api/timeline/global | — | cursor, limit, direction, page, offset | limit ≤100 | read `/timeline` | public only |
| GET | /timeline/api/timeline/explore, /trending, /bookmarks, /likes | — | page, limit, offset | limit 1–100 | read `/timeline` | page1, limit20 |
| GET | /timeline/api/timeline/user/:userId | `userId` | page, limit, offset | limit 1–100 | read `/timeline` | page1, limit20 |
| GET | /timeline/api/timeline/group/:groupId | `groupId` | cursor, limit, direction, page, offset | limit ≤100 | read `/timeline` + requireGroupMembership() | cursor/offset paginated, newest-first feed of a group's posts |
| POST/DELETE | /timeline/api/interactions/:id/like, /repost, /bookmark | `id` | — | — | `req.user.id` (401 if none) | 201 on POST |
| POST/DELETE | /timeline/api/interactions/users/:id/follow | `id` | — | — | `req.user.id` | 201 on POST |
| GET | /timeline/api/interactions/users/:id/follow | `id` | — | — | `req.user.id` | `{ following: boolean }` |
| POST | /timeline/api/lists/ | `name` | description, visibility | name ≤100; visibility∈public/private | write `/lists` | 201; visibility=public |
| GET | /timeline/api/lists/ | — | page, limit, offset | limit 1–100 | read `/lists` | page1, limit20 |
| GET | /timeline/api/lists/:id | `id`(uuid) | — | uuid | read `/lists` | 403 if private non-owner |
| PUT | /timeline/api/lists/:id | `id`(uuid) | name, description, visibility | uuid | update `/lists` | owner only |
| DELETE | /timeline/api/lists/:id | `id`(uuid) | — | uuid | delete `/lists` | owner only |
| POST | /timeline/api/lists/:id/members | `id`(uuid), `userId` | — | uuid | write `/lists` | owner only |
| DELETE | /timeline/api/lists/:id/members/:userId | `id`(uuid), `userId`(uuid) | — | uuid | read `/lists` | owner only |
| GET | /timeline/api/lists/:id/timeline | `id`(uuid) | page, limit, offset | limit 1–100 | read `/lists` | page1, limit20 |
| GET | /timeline/api/search/posts | `q` | page, limit, offset, sortBy, hasMedia, dateFrom, dateTo | q ≥2; limit 1–100 | read `/search` | sortBy=relevance |
| GET | /timeline/api/search/hashtags | `q` | page, limit, offset | limit 1–100 | read `/search` | strips leading # |
| GET | /timeline/api/search/trending/topics, /hashtags | — | page, limit, offset | limit 1–100 | read `/search` | last 24h |
| GET | /timeline/api/jobs/stats[/:queueName] | (queueName) | — | — | read `/jobs` + **admin** | — |
| GET | /timeline/api/jobs/:queueName/jobs | `queueName` | status, limit | status∈waiting/active/completed/failed/delayed | read `/jobs` + admin | status=waiting, limit=20 |
| GET | /timeline/api/jobs/:queueName/job/:jobId | `queueName`, `jobId` | — | — | read `/jobs` + admin | 404 if missing |
| POST | /timeline/api/jobs/:queueName/pause, /resume | `queueName` | — | — | read `/jobs` + admin | — |
| POST | /timeline/api/jobs/:queueName/clean | `queueName` | grace | — | read `/jobs` + admin | grace=3600000 |
| POST | /timeline/api/jobs/:queueName/job/:jobId/retry | `queueName`, `jobId` | — | — | read `/jobs` + admin | — |
| DELETE | /timeline/api/jobs/:queueName/job/:jobId | `queueName`, `jobId` | — | — | read `/jobs` + admin | — |
| POST | /timeline/api/attachments/posts/:postId | `postId`(uuid); multipart `files` | — | uuid; files 1–10; ≤100MB | write `/attachments` | 201; owner only |
| POST | /timeline/api/attachments/comments/:commentId | `commentId`(uuid); multipart `files` | — | uuid; files 1–10; ≤100MB | write `/attachments` | 201; visibility=private |
| GET | /timeline/api/attachments/posts/:postId, /comments/:commentId | id(uuid) | — | uuid | read `/attachments` | 403 if no access |
| GET | /timeline/api/attachments/:id | `id`(uuid) | — | uuid | read `/attachments` | 403 if no access |
| PUT | /timeline/api/attachments/:id | `id`(uuid) | description, altText, isPrimary | uuid | write `/attachments` | uploader only |
| DELETE | /timeline/api/attachments/:id | `id`(uuid) | — | uuid | delete `/attachments` | uploader only |
| GET | /timeline/api/attachments/:id/download | `id`(uuid) | — | uuid | read `/attachments` | redirects to fileUrl |
| POST | /timeline/api/attachments/:id/share | `id`(uuid) | expiresAt, maxDownloads, password | uuid | read `/attachments` | uploader only |
| GET/POST | /timeline/api/config/:sectionId | `sectionId`∈timeline-settings/timeline-moderation | — | — | **none** | 404 unknown |
| POST | /timeline/api/webhooks/bluesky | header `x-webhook-signature`; `event`, `data` | — | — | HMAC-SHA256 (`BLUESKY_WEBHOOK_SECRET`) | 503 if unset; 401 bad sig |
| POST | /timeline/api/webhooks/moderator | `event`, `data` | — | — | **none (no signature check)** | — |
| POST | /timeline/api/webhooks/approval | header `x-webhook-signature`; `postId`, `decision` | `reason`, `decidedBy` | decision approved\|rejected | HMAC-SHA256 (persisted `approvalSecret`, else `TIMELINE_APPROVAL_WEBHOOK_SECRET`) | decision callback for held posts; 503 when no secret configured |
| GET | /timeline/health[/db,/redis,/ca,/herald,/elasticsearch,/queues,/ready,/live] | — | — | — | none | 503 if deps down |

### Socket.IO events (namespace /timeline)

Handshake `validateSocketToken` validates CA token (`{read:true}`) with service HMAC headers; failure rejects.
On connect socket joins `user:<userId>`.

| Event | Direction | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| subscribe:timeline | client→server | — | — | — | authed | joins `timeline:global` |
| unsubscribe:timeline | client→server | — | — | — | authed | leaves room |
| subscribe:group / unsubscribe:group | client→server | `groupId` | — | — | authed | joins/leaves `timeline:group:{groupId}` |
| subscribed:timeline / unsubscribed:timeline | server→client | — | — | — | — | acks |
| new:post | server→client (`timeline:global`) | full post object | — | — | — | via broadcastNewPost |
| post:liked | server→client (`timeline:global`) | `postId`, `userId` | — | — | — | — |
| post:commented | server→client (`timeline:global`) | `postId`, `comment` | — | — | — | — |
| post:created / updated / deleted | server→client (namespace) | post payload | — | — | — | from IPC handlers |
| new:post / post:liked / post:commented | server→client (`timeline:group:{groupId}`) | as above | — | — | — | emitted to the group room for group posts |

---

## Prefetch module (prefix /prefetch)

CA-token middleware from `@exprsn/shared`. `requireSelfOrAdmin` = `req.userId === :userId` OR token
`permissions.admin`. The `prefetch.js` router is **double-mounted** at `/api/prefetch` and `/api/cache`,
so every endpoint is reachable under both prefixes (`/api/cache/...` shown parenthetically). No Socket.IO.

### REST endpoints

| Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| GET | /prefetch/health[/redis,/timeline,/ca,/cache,/ready,/live] | — | — | — | none | — |
| GET | /prefetch/api/config/:sectionId | `sectionId`∈prefetch/prefetch-settings/prefetch-cache/prefetch-performance | — | — | none | 404 unknown |
| POST | /prefetch/api/config/:sectionId | `sectionId`; config | config fields | sectionId∈settings/cache/performance | none | 404 unknown |
| POST | /prefetch/api/prefetch/schedule/:userId (also /api/cache/...) | `userId`(UUID) | priority, delay | priority∈high/medium/low | CA **write** + self-or-admin | priority=medium, delay=0; 202 |
| POST | /prefetch/api/prefetch/immediate/:userId (also /api/cache/...) | `userId`(UUID) | priority | priority∈high/medium/low | CA **write** + self-or-admin | priority=medium |
| GET | /prefetch/api/prefetch/:userId (also /api/cache/:userId) | `userId`(UUID) | — | — | CA **read** + self-or-admin | 404 if not cached |
| DELETE | /prefetch/api/prefetch/:userId/timeline (also /api/cache/...) | `userId`(UUID) | — | — | CA **delete** + self-or-admin | — |
| GET | /prefetch/api/prefetch/status/:userId (also /api/cache/...) | `userId`(UUID) | — | — | CA **read** + self-or-admin | — |
| GET | /prefetch/api/prefetch/queue/stats (also /api/cache/...) | — | — | — | CA **read** | — |
| GET | /prefetch/api/prefetch/queue/failed (also /api/cache/...) | — | limit | — | CA **read** | limit=10 |
| POST | /prefetch/api/prefetch/queue/retry/:jobId (also /api/cache/...) | `jobId` | — | — | CA **write** (no self-or-admin) | — |
| GET | /prefetch/api/prefetch/metrics (also /api/cache/...) | — | — | — | CA **read** | — |
| GET | /prefetch/api/prefetch/metrics/:date (also /api/cache/...) | `date` | — | date `YYYY-MM-DD` else 400 | CA **read** | — |

---

## Moderator module (prefix /moderator)

**Mounted routes dir is `services/moderator/routes/`** (entry requires `../routes/...`); the parallel
`src/routes/` supplies only `config.js` and `notifications.js`. REST routes have **no auth** except
`/api/notifications` (per-service HMAC `X-Service-ID`/`X-Service-Token`). Some handlers read `req.user`
that nothing populates, falling back to body fields.

### REST endpoints

| Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| GET | /moderator/health[/db,/ai-providers] | — | — | — | none | — |
| POST | /moderator/api/moderate/content | `contentType`, `contentId`, `sourceService`, `userId`, (`contentText` OR `contentUrl`) | contentText, contentUrl, contentMetadata, aiProvider | — | none | — |
| GET | /moderator/api/moderate/status/:sourceService/:contentType/:contentId | params | — | — | none | 404 if none |
| POST | /moderator/api/moderate/batch | `items`(array) | — | items 1–100 | none | — |
| GET | /moderator/api/queue/pending | — | limit, offset | — | none | limit=50, offset=0 |
| GET | /moderator/api/queue | — | priority, status, limit, offset | — | none | status=pending, limit=50, offset=0; order priority DESC |
| GET | /moderator/api/queue/:id | `id` | — | — | none | 404 if missing |
| POST | /moderator/api/queue/:itemId/approve, /reject | `itemId`, `moderatorId` | notes | — | none | notes='' |
| POST | /moderator/api/queue/:id/analyze | `id` | — | — | none | — |
| POST | /moderator/api/queue/:id/warn | `id` | moderatorId, reason | — | none | moderatorId=system, reason default |
| POST | /moderator/api/queue/:id/remove | `id` | moderatorId, reason | — | none | moderatorId=system, reason default |
| POST | /moderator/api/queue/:id/ban | `id` | moderatorId, reason, duration | — | none | moderatorId=system, duration=permanent |
| POST | /moderator/api/queue/:id/skip | `id` | — | — | none | priority=low |
| POST | /moderator/api/reports | `contentType`, `contentId`, `sourceService`, `reportedBy`, `reason` | details | — | none | status=open |
| GET | /moderator/api/reports/:id | `id` | — | — | none | 404 if missing |
| PUT | /moderator/api/reports/:id/resolve | `id`, `resolvedBy` | resolutionNotes, actionTaken | — | none | status=resolved |
| GET | /moderator/api/rules | — | enabled, appliesTo, limit, offset | — | none | limit=50, offset=0; order priority DESC |
| GET | /moderator/api/rules/:id | `id` | — | — | none | — |
| POST | /moderator/api/rules | `name`, `action`, `conditions` | description, appliesTo, sourceServices, thresholdScore, enabled, priority | — | none | enabled=true, priority=0; 201 |
| PUT | /moderator/api/rules/:id | `id` | rule fields | — | none | provided fields only |
| DELETE | /moderator/api/rules/:id | `id` | — | — | none | — |
| POST | /moderator/api/rules/:id/test | `id` | contentType, contentText, riskScore, scores | — | none | sourceService=test |
| POST | /moderator/api/rules/:id/enable, /disable | `id` | — | — | none | sets enabled |
| POST | /moderator/api/appeals | `reason`, (`moderationItemId` OR `userActionId`) | additionalInfo, userId | — | none | userId from req.user?.id or body; 201 |
| GET | /moderator/api/appeals | — | status, userId, limit, offset | — | none | limit=50, offset=0 |
| GET | /moderator/api/appeals/stats/summary | — | — | — | none | — |
| GET | /moderator/api/appeals/case/:moderationItemId | `moderationItemId` | — | — | none | — |
| GET | /moderator/api/appeals/:id | `id` | — | — | none | 404 if not found |
| POST | /moderator/api/appeals/:id/review | `id`, `decision`, `notes` | reviewerId | decision∈approve/deny | none | reviewerId from req.user?.id or body |
| GET | /moderator/api/workflows[/active] | — | — | — | none | — |
| POST | /moderator/api/workflows | `name`, `steps`(array) | description, trigger, enabled, tags | — | none | 201 |
| PUT | /moderator/api/workflows/:id | `id`, `updates` | — | — | none | — |
| DELETE | /moderator/api/workflows/:id | `id` | — | — | none | — |
| POST | /moderator/api/workflows/:id/execute | `id` | data | — | none | — |
| POST | /moderator/api/workflows/trigger/:id | `id` | body | — | none | — |
| GET | /moderator/api/workflows/executions/:executionId | `executionId` | — | — | none | 404 if missing |
| POST | /moderator/api/workflows/callback | callback payload | executionId, workflowId | — | none | — |
| POST | /moderator/api/workflows/setup-defaults | — | — | — | none | — |
| POST | /moderator/api/workflows/moderate/auto | `contentId`, `contentType`, `content` | authorId, metadata, context | — | none | context={} |
| GET | /moderator/api/metrics | — | period | period∈today/week/month/all | none | period=today |
| GET | /moderator/api/metrics/export | — | period | period∈today/week/month/all | none | period=today; CSV |
| GET | /moderator/api/actions/recent | — | limit | — | none | limit=10 |
| GET | /moderator/api/actions/:id | `id` | — | — | none | 404 if missing |
| GET | /moderator/api/actions/content/:contentType/:contentId | params | — | — | none | — |
| POST | /moderator/api/actions/execute | `actionType`, `contentType`, `contentId`, `sourceService` | userId, reason, moderatorId, metadata | — | none | moderatorId=system, reason default |
| GET | /moderator/api/actions/providers/status | — | — | — | none | — |
| GET | /moderator/api/config/:sectionId | `sectionId`∈moderation-rules/moderation-ai/moderation-queue | — | — | none | 404 unknown |
| POST | /moderator/api/config/:sectionId | `sectionId`; config | — | only moderation-ai | none | 404 unknown |
| POST | /moderator/api/notifications | headers `X-Service-ID`/`X-Service-Token`; `userId` | type, channel, title, body, data, priority | — | **per-service HMAC** | type=info, channel=in-app, data={}, priority=normal; 201 |

### Socket.IO events (namespace /moderation)

**No token auth** (TODO(platform)). On connect socket joins room `moderators`; `handshake.query.role==='admin'`
also joins `admins`. No inbound handlers besides `disconnect`. Server emits queue/case updates to these rooms.

| Event | Direction | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| connection | server-side | — | handshake.query.role | — | none | joins `moderators` (+`admins` if role=admin) |
| disconnect | client→server | — | — | — | — | — |

### Socket.IO events (namespace /notifications)

Namespace `use()` validates CA token (`{read:true}`) and requires `data.valid && data.userId`; on connect
joins `user:{userId}` (from validated token, never client query).

| Event | Direction | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| (handshake) | server `use()` | auth.token OR Bearer | — | — | **CA token (read), must return userId** | — |
| connection | server-side | — | — | — | authenticated | joins `user:{userId}` |
| disconnect | client→server | — | — | — | — | — |
| notification | server→client | `id`, `userId`, `type`, `channel`, `title`, `body`, `data`, `priority`, `createdAt` | — | — | room `user:{userId}` | emitted by HTTP ingest |

---

## Live module (prefix /live)

`requireAuth` = CA token (Bearer or cookie `token`, validated with `requiredPermission:'read'`) → `req.user`.
`optionalAuth` allows anonymous. Ownership checks compare `req.user.id` to resource owner. Joi (`stripUnknown`).
For streams with a `group_id`, the `start`/`stop`/`PUT`/`DELETE` authorization is group owner/admin
instead of personal owner.

### REST endpoints

| Method | Path | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| GET | /live/ , /live/api/stats , /live/health | — | — | — | none | — |
| POST | /live/api/streams | `title` | description, visibility, isRecording | title 1–255; description ≤2000; visibility∈public/unlisted/private | requireAuth | visibility=public, isRecording=true; 201 |
| GET | /live/api/streams | — | status, visibility, userId, limit, offset | status∈pending/live/ended/error; limit 1–100; offset ≥0 | optionalAuth | limit=20, offset=0 |
| GET | /live/api/streams/:id | `id`(UUID) | — | — | optionalAuth | 403 if private non-owner |
| PUT | /live/api/streams/:id | `id`(UUID); ≥1 field | title, description, visibility | title 1–255; description ≤2000; body.min(1) | requireAuth (owner) | — |
| DELETE | /live/api/streams/:id | `id`(UUID) | — | — | requireAuth (owner) | broadcasts stream-deleted |
| POST | /live/api/streams/:id/start, /stop | `id`(UUID) | — | — | requireAuth (owner) | broadcasts stream-started/ended |
| POST | /live/api/streams/:id/share-events | `id`(UUID), `eventType` | source, ref | eventType∈link_shared/link_opened/watch_started; source ≤50; ref ≤128 | optionalAuth | — |
| GET | /live/api/streams/:id/recordings | `id`(UUID) | — | — | optionalAuth | 403 if private non-owner |
| POST | /live/api/rooms | `name` | description, maxParticipants, isPrivate, password, settings | name 1–255; description ≤2000; maxParticipants 2–50; password 4–100 (req if isPrivate) | requireAuth | maxParticipants=10, isPrivate=false; settings: enableChat=true, enableScreenShare=true, enableRecording=false, muteOnJoin=false, videoOnJoin=true; 201 |
| GET | /live/api/rooms | — | status, hostId, isPrivate, limit, offset | status∈waiting/active/ended; limit 1–100; offset ≥0 | optionalAuth | limit=20, offset=0 |
| GET | /live/api/rooms/code/:code | `code` | — | — | optionalAuth | 404 if missing |
| GET | /live/api/rooms/:id | `id`(UUID) | — | — | optionalAuth | — |
| PUT | /live/api/rooms/:id | `id`(UUID); ≥1 field | name, description, maxParticipants, settings | name 1–255; maxParticipants 2–50; body.min(1) | requireAuth (owner) | — |
| POST | /live/api/rooms/:id/join | `id`(UUID) | password, displayName, peerId; socketId/x-socket-id | displayName ≤100; peerId ≤255 | requireAuth | socketId=`web-{Date.now()}`; 403 if full/bad password |
| POST | /live/api/rooms/:id/leave | `id`(UUID); socketId (query or header) | — | — | requireAuth | 400 if no socketId |
| GET | /live/api/rooms/:id/participants, /recordings | `id`(UUID) | — | — | optionalAuth | — |
| DELETE | /live/api/rooms/:id | `id`(UUID) | — | — | requireAuth (owner) | broadcasts room-closed |
| POST | /live/api/simulcast/:streamId/start | `streamId`(UUID) | inputSource (URI) | — | requireAuth (owner) | — |
| POST | /live/api/simulcast/:streamId/stop | `streamId`(UUID) | — | — | requireAuth (owner) | — |
| GET | /live/api/simulcast/:streamId/status, /health, /metrics | `streamId`(UUID) | — | — | requireAuth (owner) | 404 if no active simulcast |
| POST | /live/api/simulcast/:streamId/destinations | `streamId`(UUID), `destinationId`(UUID) | — | — | requireAuth (owner) | status=connecting |
| DELETE | /live/api/simulcast/:streamId/destinations/:destinationId | `streamId`(UUID), `destinationId`(UUID) | — | — | requireAuth (owner) | status=disconnected |
| GET | /live/api/destinations | — | stream_id(UUID), platform, is_enabled | platform∈youtube/twitch/facebook/cloudflare/rtmp_custom | requireAuth | excludes secrets |
| GET | /live/api/destinations/:id | `id`(UUID) | — | — | requireAuth (owner) | excludes secrets |
| POST | /live/api/destinations | `stream_id`(UUID), `platform`, `name` | rtmp_url, stream_key, access_token, refresh_token, token_expires_at, is_enabled, metadata, settings | name 1–255; settings bitrate 500–20000, framerate 15–60, max_retries 0–10 | requireAuth | is_enabled=true; settings: bitrate=4500, resolution=1920x1080, framerate=30, auto_start=false, auto_reconnect=true, max_retries=3; 201 |
| PUT | /live/api/destinations/:id | `id`(UUID) | name, is_enabled, metadata, settings | name 1–255; bitrate 500–20000; framerate 15–60; max_retries 0–10 | requireAuth (owner) | 400 if live/connecting |
| DELETE | /live/api/destinations/:id | `id`(UUID) | — | — | requireAuth (owner) | 400 if live/connecting |
| GET | /live/api/destinations/platforms/:platform/auth-url | `platform` | state | platform∈youtube/twitch/facebook | requireAuth | state auto-generated |
| POST | /live/api/destinations/platforms/:platform/exchange-token | `platform`, `code`, `stream_id`(UUID), `name` | — | platform∈youtube/twitch/facebook; name 1–255 | requireAuth | is_enabled=true; 201 |
| POST | /live/api/destinations/:id/test-connection | `id`(UUID) | — | — | requireAuth (owner) | — |
| POST | /live/api/groups/:groupId/streams | `groupId`, `title` | description, visibility, isRecording | title 1–255 | requireAuth + group admin (requireGroupMembership('admin')) | create a group-owned live stream; 201 |
| GET | /live/api/groups/:groupId/streams | `groupId` | status, visibility, limit, offset | limit 1–100 | requireAuth + group member | list a group's streams |
| GET/POST | /live/api/config/:sectionId | `sectionId`∈live-rooms/live-recordings/live-settings | — | POST only live-settings | none | 404 unknown |

### Socket.IO events (namespace /live)

**No handshake token auth** (TODO(platform)); identity from a `Participant` DB row matched by `socket_id`.
Payloads are plain objects (no Joi). `to`/`from` are peer socket ids.

| Event | Direction | Required Fields | Optional Fields | Min/Max | Auth | Defaults |
|---|---|---|---|---|---|---|
| join-stream | client→server | `streamId` | — | — | none | emits viewer-count-updated/viewer-joined |
| leave-stream | client→server | `streamId` | — | — | none | — |
| join-room | client→server | `roomId` | — | — | none (needs Participant row) | emits participant-joined, existing-participants |
| update-participant-state | client→server | `roomId`, `state` | state.audioEnabled, state.videoEnabled | — | none | emits participant-state-changed |
| leave-room | client→server | `roomId` | — | — | none | — |
| signal / offer / answer / ice-candidate | client→server | `to`, payload | — | — | none | forwards to peer |
| disconnect | client→server | — | — | — | none | marks Participant disconnected |
| viewer-count-updated | server→client | `streamId`, `count` | — | — | — | to stream room |
| viewer-joined / viewer-left | server→client | `streamId`, `socketId`, `viewerCount` | — | — | — | — |
| participant-joined | server→client | `roomId`, `participant` | — | — | — | also from REST join |
| existing-participants | server→client | `roomId`, `participants[]` | — | — | — | to joining socket |
| participant-state-changed | server→client | `roomId`, `socketId`, `userId`, `state` | — | — | — | — |
| participant-left | server→client | `roomId`, `socketId`, `userId`, `participantCount` | — | — | — | also from REST leave |
| signal / offer / answer / ice-candidate | server→client | `from`, payload | — | — | — | to peer `to` |
| stream-started / ended / deleted | server→client | `streamId` | — | — | — | namespace broadcast |
| room-closed | server→client | `roomId` | — | — | — | to room |
| error | server→client | `event`, `message` | — | — | — | on join failure |


## Atproto module (prefix /atproto) — AT-Protocol / Bluesky bridge

Ingests the Bluesky firehose into the moderator pipeline, operates as a labeler
(signing labels from moderation verdicts), and serves its own label firehose.
Supports Exprsn's self-certifying **did:exprsn** method plus did:web/did:plc.
The firehose **ingest** runs as a separate worker (`npm run worker:atproto`),
not in the gateway. Provision identity with `npm run atproto:provision`.

### REST endpoints (module prefix /atproto)

| Method | Path | Body/params | Auth | Notes |
|---|---|---|---|---|
| GET | /atproto/health | — | none | `{ ok, enabled, transport }` |
| GET | /atproto/identity | — | none | active labeler DID + key + published state |
| GET | /atproto/service-record | — | none | the `app.bsky.labeler.service` declaration |
| GET | /atproto/stats | — | none | label counts, last seq, inbound count, moderation queue counts |
| GET | /atproto/inbound-labels | `uri?`, `src?`, `verified?`, `limit?` | none | INGEST: labels consumed from external labelers |
| GET | /atproto/external-labelers | — | none | subscriptions + live health (status, lastEventAt, connectAttempts, heartbeatAt, lastError) |
| POST | /atproto/external-labelers | `labeler` (DID or wss URL) | **adminGuard** | subscribe; worker reconciles + connects (~15s) |
| DELETE | /atproto/external-labelers | `endpoint` (body or `?endpoint=`), `?purge` | **adminGuard** | unsubscribe (deactivate, or purge) |
| GET | /atproto/feed-record | — | none | the app.bsky.feed.generator record + uri to publish |
| GET | /atproto/users/:userId/dids | — | none | per-user DIDs; mints did:exprsn lazily |
| PUT | /atproto/users/:userId/dids | `didWeb?`, `didPlc?` | **owner** (CA bearer, `req.userId`==`:userId`) **or admin** | link did:web/did:plc (must resolve; starts unverified) |
| POST | /atproto/users/:userId/dids/challenge | — | owner or admin | issue a proof-of-control challenge token |
| POST | /atproto/users/:userId/dids/verify | `method`∈web/plc | owner or admin | verify control (well-known file for web, profile desc for plc) |
| DELETE | /atproto/users/:userId/dids/:method | `method`∈web/plc | owner or admin | unlink a DID |
| POST | /atproto/labels/verify | `src`, `sig`, label fields | none | INGEST: resolve issuer DID + verify signature (pure read) |
| POST | /atproto/labels | `uri`, `val`, `neg?`, `cid?` | **adminGuard**: platform-admin CA bearer **or** `X-Service-Token` | OUTGEST: manually sign+emit a label (operator action) |
| POST | /atproto/labels/negate | `uri`, `reason?` | **adminGuard** | retract all our labels for a URI (queued to the worker) |

### Origin-root endpoints (served via the gateway `rootApp` mount, NOT under /atproto)

| Method | Path | Notes |
|---|---|---|
| GET | /.well-known/did.json | labeler DID document (`#atproto_label` key + `#atproto_labeler` service) |
| GET | /.well-known/atproto-did | the labeler DID (text/plain) |
| GET | /xrpc/com.atproto.label.queryLabels | `uriPatterns` (req, repeatable), `sources`, `limit`, `cursor` → `{ cursor, labels[] }` |
| GET | /xrpc/com.exprsn.identity.resolveDid | `did` → DID document (did:exprsn/did:key offline-derived, did:web/did:plc fetched) |
| GET | /xrpc/app.bsky.feed.describeFeedGenerator | → `{ did, feeds:[{uri}] }` |
| GET | /xrpc/app.bsky.feed.getFeedSkeleton | `feed`, `limit`, `cursor` → curated feed (ingested posts minus active !hide) |
| WS | /xrpc/com.atproto.label.subscribeLabels | `?cursor=N` → framed `#labels` messages (backfill + live); shares the HTTPS `upgrade` event with Socket.IO |

### Things to note
- Labels carry a monotonic `seq` (BIGSERIAL) used as the subscribeLabels cursor;
  correctness assumes a **single writer** (the single-instance worker).
- Firehose authors are DIDs; the moderator's `userId` is a UUID, so the bridge
  stores the real DID in `atproto.uri_case_map.author_did` and synthesizes
  `userId = UUIDv5(did)`.
- **Negation**: a labeled post deleted from the firehose, or a moderation appeal
  approved (`moderator` → `jobQueue.addNegationJob`), enqueues `negate-atproto`;
  the worker emits matching `neg:true` labels (idempotent).
- **Consuming external labelers**: set `ATPROTO_SUBSCRIBE_LABELERS` (labeler DIDs
  or wss URLs). The worker subscribes, verifies signatures, and stores
  `inbound_labels`. Resolving `did:plc:ar7c4by46qjdydhdevvrndac` reaches
  Bluesky's own moderation labeler (`mod.bsky.app`).
- **did:plc** publishing (`ATPROTO_DID_METHOD=plc` + `ATPROTO_PDS_*`) publishes
  `app.bsky.labeler.service` and runs a PLC op (2-step: needs an emailed
  `ATPROTO_PLC_TOKEN`). did:exprsn/did:web need no PDS.
- The mutating endpoints (`/labels`, `/labels/negate`) use `adminGuard`
  (`services/atproto/src/middleware/adminGuard.js`): a platform-admin CA bearer
  (`isPlatformAdmin(req.tokenData.email)`, PLATFORM_ADMIN_EMAILS) **or** the
  service token. The admin console's AT-Protocol view drives these (Apply label,
  Negate, Hide) using the operator's bearer.



