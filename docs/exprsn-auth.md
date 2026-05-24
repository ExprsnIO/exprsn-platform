# Exprsn-Auth — Authentication, SSO & Identity

> **Service:** `@exprsn/auth` · **Port:** `3001` (HTTP/HTTPS) · **Entry point:** `src/index.js`
> **Status:** Production · **Depends on:** Exprsn-CA (for capability-token lifecycle)

**Exprsn-Auth** is the platform's identity provider and authorization server. It handles user
authentication (local, social, enterprise SSO), multi-factor authentication, OAuth2/OIDC
provider duties, SAML 2.0, role-based access control, multi-tenant organizations, and
subscription/billing metadata. It delegates the issuing and validation of platform
**CA Tokens** to [Exprsn-CA](./exprsn-ca.md).

---

## Table of Contents

1. [Responsibilities](#responsibilities)
2. [Entry Points & Architecture](#entry-points--architecture)
3. [Technology Stack](#technology-stack)
4. [Directory Layout](#directory-layout)
5. [Configuration](#configuration)
6. [Data Model](#data-model)
7. [Authentication Methods](#authentication-methods)
8. [Multi-Factor Authentication](#multi-factor-authentication)
9. [OAuth2 Provider](#oauth2-provider)
10. [OpenID Connect (OIDC)](#openid-connect-oidc)
11. [SAML 2.0 SSO](#saml-20-sso)
12. [LDAP / Active Directory](#ldap--active-directory)
13. [Role-Based Access Control (RBAC)](#role-based-access-control-rbac)
14. [Organizations & Multi-Tenancy](#organizations--multi-tenancy)
15. [Sessions](#sessions)
16. [CA Token Integration](#ca-token-integration)
17. [Billing & Subscriptions](#billing--subscriptions)
18. [Email Service](#email-service)
19. [HTTP API Reference](#http-api-reference)
20. [Web UI Routes](#web-ui-routes)
21. [Running the Service](#running-the-service)
22. [Testing](#testing)
23. [Security Considerations](#security-considerations)
24. [Troubleshooting](#troubleshooting)

---

## Responsibilities

| Capability | Description |
|------------|-------------|
| **Local authentication** | Email/password with bcrypt and a strict password policy. |
| **Social login** | Google and GitHub OAuth2 via Passport. |
| **Enterprise SSO** | SAML 2.0 (Service Provider) and LDAP/Active Directory. |
| **MFA** | TOTP (authenticator apps) and single-use backup codes. |
| **OAuth2 provider** | Authorization-code (+ PKCE) and refresh-token grants for first/third-party apps. |
| **OIDC provider** | Discovery, JWKS, UserInfo, introspection, revocation. |
| **RBAC** | Roles, permissions, groups, organization/application scoping with Redis-cached resolution. |
| **Organizations** | Multi-tenant orgs with members, roles, and ownership transfer. |
| **Sessions** | Active session listing, refresh, and revocation. |
| **CA token lifecycle** | Generates/validates/revokes platform CA tokens through Exprsn-CA. |
| **Billing metadata** | Subscriptions, usage records, invoices, and tiered feature flags. |

---

## Entry Points & Architecture

The package declares `"main": "src/index.js"` and `"start": "node src/index.js"`, so the
**canonical runtime is `src/index.js`** — a full Express server with EJS web UI, Passport
sessions, the OAuth2/OIDC/SAML stack, and CA integration.

> A second, legacy entry point exists at the top-level `index.js` (an `AuthService` class wired
> for IPC, `HTTPSServerManager`, and a thinner `/api/*` surface). It represents an alternate
> microservice architecture and is **not** the one started by `npm start`. Likewise, the
> top-level `routes/` and `models/` folders hold legacy route variants plus the billing models;
> the active web/API routes live under `src/routes/`.

```
                       ┌─────────────────────────────────────────────────────┐
  HTTP/HTTPS :3001 ────▶            exprsn-auth (src/index.js)                │
                       │  helmet · cors · compression · express-session       │
                       │  Passport (local, google, github, saml)              │
                       │                                                      │
                       │  Web UI (EJS)          JSON API (/api/*)             │
                       │  /login /register      /api/auth   /api/oauth2       │
                       │  /dashboard /admin     /api/saml    /.well-known/*   │
                       │  /setup                /api/mfa     /api/sessions    │
                       │                        /api/roles   /api/organizations│
                       │                        /api/applications /api/ldap   │
                       └───────┬───────────────────────────┬──────────────────┘
                               │                           │
              ┌────────────────┴───────┐        ┌──────────┴──────────┐
              │ PostgreSQL (exprsn_auth)│        │  Exprsn-CA (:3000)  │
              │ users, orgs, roles,     │        │  token generate /   │
              │ oauth2_*, sessions, …   │        │  validate / revoke  │
              └────────────────┬────────┘        └─────────────────────┘
                               │
                        Redis (optional)
                        permission cache, sessions
```

On startup `src/index.js` initializes the database, optional Redis, Passport strategies, seeds
system permissions/roles (`db.initializeSystemData()`), and performs CA integration with retry
logic governed by `CA_REQUIRED`, `CA_WAIT`, and `CA_MAX_ATTEMPTS`.

---

## Technology Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js `>=18`, npm `>=9` |
| Web framework | Express 4 + EJS (`express-ejs-layouts`), `connect-flash` |
| Auth | Passport (`passport-local`, `passport-google-oauth20`, `passport-github2`, `passport-saml`, `passport-oauth2`, `passport-custom`) |
| OAuth2 server | `oauth2-server` |
| MFA | `speakeasy` (TOTP) + `qrcode` |
| Enterprise | `ldapjs` (LDAP/AD), `passport-saml` (SAML 2.0) |
| ORM / DB | Sequelize 6 + PostgreSQL (`pg`) |
| Cache / sessions | Redis (`redis`, `connect-redis`) |
| Passwords / tokens | `bcrypt`, `jsonwebtoken` |
| Email | `nodemailer` (SMTP), `@sendgrid/mail`, `@aws-sdk/client-ses`, `mailgun.js`, `handlebars` templates |
| Security | `helmet`, `cors`, `express-rate-limit` |
| HTTP client | `axios` (CA calls) |
| Shared | `@exprsn/shared` (local workspace package) |

The dev toolchain includes TypeScript and `@types/*` (lint/format target `.ts`), though the
runtime sources are JavaScript.

---

## Directory Layout

```
src/exprsn-auth/
├── src/                       # ACTIVE service (entry: src/index.js)
│   ├── index.js               # Express app, sessions, passport, CA init, route mounting
│   ├── config/                # index.js (aggregate), passport.js, saml.js
│   ├── routes/                # auth, oauth2, oidc, saml, mfa, sessions, users, groups,
│   │                          #   organizations, applications, roles, tokens, ldap,
│   │                          #   admin, setup, config, public, health
│   ├── services/              # passwordService, tokenService, caService, oauth2Service,
│   │                          #   oidcService, samlService, ldapService, rbacService,
│   │                          #   organizationService, emailService, smsService
│   ├── models/                # User, Organization, OrganizationMember, Group, UserGroup,
│   │                          #   Role, UserRole, GroupRole, Permission, Application,
│   │                          #   OAuth2Client, OAuth2Token, OAuth2AuthorizationCode,
│   │                          #   Session, LdapConfig
│   ├── middleware/            # requireAuth, rbac, adminAuth
│   ├── strategies/            # ldap.strategy.js
│   ├── validators/            # auth.js (+ index)
│   ├── templates/emails/      # verification, welcome, password-reset, security-alert, mfa-backup-codes
│   ├── public/css/            # admin.css
│   └── views/                 # EJS pages (login, register, dashboard, admin/*, setup/*)
├── index.js                   # Legacy AuthService microservice variant (IPC) — not run by npm start
├── routes/                    # Legacy routes + billing.js, webhooks.js
├── models/                    # Billing models: Subscription, UsageRecord, Invoice, FeatureFlag
├── migrations/                # Sequelize migrations (all tables, incl. billing)
├── seeders/                   # 20251224000001-seed-feature-flags.js
└── tests/                     # auth, mfa, session, oauth2, saml, organization, rbac, passwordService
```

---

## Configuration

Configuration is assembled in `src/config/index.js`. Highlights and the env vars that drive
them:

### Service
| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment |
| `AUTH_SERVICE_PORT` | `3001` | Listen port |
| `AUTH_SERVICE_HOST` | `localhost` | Bind host |
| `TLS_ENABLED` | `true` | Serve HTTPS |
| `TLS_CERT_PATH` / `TLS_KEY_PATH` | `./certs/localhost-*.pem` | TLS material |

### Database
| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_DB_HOST` | `localhost` | PostgreSQL host |
| `AUTH_DB_PORT` | `5432` | Port |
| `AUTH_DB_NAME` | `exprsn_auth` | Database |
| `AUTH_DB_USER` | `postgres` | User |
| `AUTH_DB_PASSWORD` | `postgres` | Password |
| `DB_LOGGING` | `false` | SQL logging |

Pool defaults: `max 20, min 5, acquire 30000ms, idle 10000ms`.

### Redis
| Variable | Default | Description |
|----------|---------|-------------|
| `REDIS_ENABLED` | `true` | Enable cache / Redis-backed sessions |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | Connection |
| `REDIS_PASSWORD` | — | Auth |

### CA integration
| Variable | Default | Description |
|----------|---------|-------------|
| `CA_URL` | `http://localhost:3000` | Exprsn-CA base URL |
| `CA_REQUIRED` | `false` | Fail startup if CA unavailable |
| `CA_WAIT` | `true` | Wait for CA to become ready |
| `CA_MAX_ATTEMPTS` | `10` | Retry attempts |
| `AUTH_CA_DOMAIN` | `auth.exprsn.io` | This service's CA domain |
| `AUTH_CERT_SERIAL` / `AUTH_PRIVATE_KEY_PATH` / `AUTH_CERTIFICATE_PATH` / `CA_ROOT_CERT_PATH` | — | Service certificate material |
| `OCSP_RESPONDER_URL` | `http://localhost:2560` | OCSP responder |

### Session
| Variable | Default | Description |
|----------|---------|-------------|
| `SESSION_SECRET` | `exprsn-auth-secret-change-in-production` | **Change in production** |
| `SESSION_LIFETIME` | `3600000` | Session lifetime (ms, 1h) |
| `SESSION_IDLE_TIMEOUT` | `900000` | Idle timeout (ms, 15m) |

### OAuth2 (built-in defaults)
- Authorization-code lifetime: **300s**
- Access-token lifetime: **3600s**
- Refresh-token lifetime: **604800s** (7 days)
- Client authentication required for `refresh_token`, optional for `authorization_code`.

### Social providers
| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_CALLBACK_URL` | Google OAuth2 |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `GITHUB_CALLBACK_URL` | GitHub OAuth2 |

### Security
| Setting | Value | Env override |
|---------|-------|--------------|
| bcrypt rounds | `12` | — |
| max login attempts | `5` | `MAX_LOGIN_ATTEMPTS` |
| lockout duration | `900000` ms | `LOCKOUT_DURATION` |
| password min length | `12` | `PASSWORD_MIN_LENGTH` |
| require MFA | `false` | `REQUIRE_MFA` |

### Other
`ENCRYPTION_KEY`, `FRONTEND_URL` (default `http://localhost:3000`),
`CORS_ORIGINS`, `LOG_LEVEL` (`info`), `LOG_DIR` (`./logs`), and email-provider variables (see
[Email Service](#email-service)).

---

## Data Model

### Active models (`src/models/`)

| Model / Table | Purpose | Notable fields |
|---------------|---------|----------------|
| **User** (`users`) | Accounts | `email`, `passwordHash`, `emailVerified`, `googleId`, `githubId`, `displayName`, `mfaEnabled`, `mfaSecret`, `mfaBackupCodes`, `loginAttempts`, `lockedUntil`, `resetPasswordToken`, `status` |
| **Organization** (`organizations`) | Tenants | `name`, `slug`, `ownerId`, `type` (enterprise/team/personal), `plan`, `billingEmail`, `metadata` |
| **OrganizationMember** (`organization_members`) | Membership | `organizationId`, `userId`, `role`, `status`, `joinedAt`, `invitedBy` |
| **Group** (`groups`) | Permission grouping | `name`, `parentId`, `permissions`, `metadata` |
| **UserGroup** (`user_groups`) | User↔Group | `userId`, `groupId`, `role` |
| **Role** (`roles`) | RBAC roles | `name`, `slug`, `permissions[]`, `priority`, `type` (system/custom/organization), `organizationId`, `isSystem`, `status` |
| **UserRole** (`user_roles`) | User↔Role | `userId`, `roleId`, `organizationId`, `applicationId`, `assignedBy`, `expiresAt` |
| **GroupRole** (`group_roles`) | Group↔Role | `groupId`, `roleId`, `organizationId`, `applicationId` |
| **Permission** (`permissions`) | Permission defs | `permissionString`, `scope`, `service`, `category` |
| **Application** (`applications`) | Registered apps | `name`, `slug`, `clientId`, `clientSecret`, `redirectUris[]`, `scopes[]`, `ownerId` |
| **OAuth2Client** (`oauth2_clients`) | OAuth2 clients | `clientId`, `clientSecret`, `redirectUris[]`, `grants[]`, `scopes[]`, `type`, `ownerId` |
| **OAuth2Token** (`oauth2_tokens`) | Access/refresh tokens | `accessToken`, `accessTokenExpiresAt`, `refreshToken`, `refreshTokenExpiresAt`, `scope[]`, `clientId`, `userId`, `revoked` |
| **OAuth2AuthorizationCode** (`oauth2_authorization_codes`) | Auth codes | `code`, `expiresAt`, `redirectUri`, `scope[]`, `codeChallenge`, `codeChallengeMethod`, `used` |
| **Session** (`sessions`) | Sessions | `sessionId`, `userId`, `ipAddress`, `userAgent`, `expiresAt`, `lastActivityAt`, `active` |
| **LdapConfig** (`ldap_configs`) | LDAP per-org config | `host`, `port`, `useSSL`, `useTLS`, `bindDN`, `baseDN`, `userSearchBase`, `syncEnabled` |

### Billing models (top-level `models/`)

| Model / Table | Purpose |
|---------------|---------|
| **Subscription** (`subscriptions`) | Tier + billing cycle (free, pro, max, premium, team_*, enterprise; monthly/annual) |
| **UsageRecord** (`usage_records`) | Metered usage (`metricKey`, `value`, `recordedAt`) |
| **Invoice** (`invoices`) | Billing invoices (`amount`, `status`, `issuedAt`, `dueAt`, `paidAt`) |
| **FeatureFlag** (`feature_flags`) | Per-tier feature availability; seeded by `seeders/20251224000001-seed-feature-flags.js` |

Migrations under `migrations/` create every table above (users, organizations, groups, roles,
permissions, applications, oauth2_clients, sessions, oauth2_tokens,
oauth2_authorization_codes, user_groups, user_roles, group_roles, organization_members,
ldap_configs, subscriptions, usage_records, invoices, feature_flags).

---

## Authentication Methods

### Local (email + password)

- Passport `LocalStrategy` (`src/config/passport.js`); credentials validated in
  `src/services/passwordService.js`.
- **Hashing:** bcrypt, **12 rounds**.
- **Password policy** (min length **12**): requires upper, lower, number, and special
  characters; rejects repeating characters (`aaa`, `111`), sequential patterns (`abc`, `123`),
  and common weak passwords.
- **Lockout:** after **5** failed attempts the account locks for **15 minutes**
  (`loginAttempts` / `lockedUntil`); last login timestamp recorded.

### Social (OAuth2 consumer)

| Provider | Strategy | Callback | Notes |
|----------|----------|----------|-------|
| Google | `passport-google-oauth20` | `/api/auth/google/callback` | scope `profile email`; auto-creates user, stores `googleId` |
| GitHub | `passport-github2` | `/api/auth/github/callback` | scope `user:email`; auto-creates user, stores `githubId` |

### Enterprise

See [SAML 2.0 SSO](#saml-20-sso) and [LDAP / Active Directory](#ldap--active-directory).

---

## Multi-Factor Authentication

Implemented in `src/routes/mfa.js` with `speakeasy` + `qrcode`.

- **TOTP** — Base32 secret, QR-code provisioning, ±2 time-step verification window.
- **Backup codes** — 10 single-use codes generated at setup; removed when used; regenerable.
- **WebAuthn / hardware keys** — *not implemented* in the current codebase.

Relevant `User` fields: `mfaEnabled`, `mfaSecret`, `mfaBackupCodes`. After a successful MFA
check the session carries `mfaVerified`, enforced by the `requireMFA` middleware. The setup,
verify, validate, and disable endpoints are `strictLimiter`-rate-limited against brute force.

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/mfa/setup` | Generate TOTP secret + QR code |
| `POST` | `/api/mfa/verify` | Verify a code to enable MFA |
| `POST` | `/api/mfa/validate` | Validate a code during login |
| `POST` | `/api/mfa/disable` | Disable MFA (password required) |
| `POST` | `/api/mfa/regenerate-backup-codes` | Issue fresh backup codes |
| `GET` | `/api/mfa/status` | Current MFA status |

---

## OAuth2 Provider

`src/routes/oauth2.js` + `src/services/oauth2Service.js`, built on `oauth2-server`.

- **Grant types:** `authorization_code` (with optional **PKCE**) and `refresh_token`.
- **Lifetimes:** auth code 300s · access token 3600s · refresh token 604800s.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/oauth2/authorize` | Authorization endpoint (requires login) |
| `POST` | `/api/oauth2/authorize` | Process consent (`requireAuth`) |
| `POST` | `/api/oauth2/token` | Exchange code → access/refresh token |
| `POST` | `/api/oauth2/revoke` | Revoke a token (RFC 7009) |
| `GET` | `/api/oauth2/userinfo` | UserInfo (`sub`, `email`, `name`, …) |
| `POST` | `/api/oauth2/introspect` | Token introspection (RFC 7662) |

OAuth2 clients are managed through the [Applications API](#applications--oauth2-clients).

---

## OpenID Connect (OIDC)

`src/routes/oidc.js` + `src/services/oidcService.js` add OIDC discovery and JWT ID tokens on top
of the OAuth2 provider.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/.well-known/openid-configuration` | Discovery document (issuer, endpoints, supported scopes/grants/response types) |
| `GET` | `/.well-known/jwks.json` | JSON Web Key Set for ID-token verification |
| `GET` | `/api/oauth2/userinfo` | OIDC UserInfo (Bearer token) |
| `POST` | `/api/oauth2/introspect` | Introspection (RFC 7662) |
| `POST` | `/api/oauth2/revoke` | Revocation (RFC 7009) |

---

## SAML 2.0 SSO

`src/routes/saml.js` + `src/services/samlService.js` + `src/config/saml.js`, using
`passport-saml`. The service acts as a **SAML Service Provider (SP)** and supports **multiple
IdPs** (keyed by `idp`), metadata generation, `RelayState` post-login redirects, and Single
Logout.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/saml/metadata` | SP metadata XML (for IdP registration) |
| `GET` | `/api/saml/login` | Initiate login (AuthnRequest) |
| `POST` | `/api/saml/callback` | Assertion Consumer Service (ACS) |
| `GET` | `/api/saml/logout` | Initiate SP logout (`requireAuth`) |
| `POST` | `/api/saml/logout/callback` | Single Logout Service (SLS) callback |
| `GET` | `/api/saml/providers` | List configured IdPs |
| `GET` | `/api/saml/status` | SAML service status |

---

## LDAP / Active Directory

`src/services/ldapService.js` + `src/strategies/ldap.strategy.js` (using `ldapjs`). Provides
bind-based authentication, directory search for users/groups, TLS/SSL, connection timeouts
(10s connect / 30s search), attribute mapping (e.g. `uid`→`username`, `mail`→`email`), group
membership sync, and auto-creation of users on first login. Configuration is persisted in the
`LdapConfig` model (per organization) and administered through `/api/ldap/*` (admin-gated).

---

## Role-Based Access Control (RBAC)

`src/services/rbacService.js` with middleware in `src/middleware/rbac.js`,
`src/middleware/requireAuth.js`, and `src/middleware/adminAuth.js`.

- **Models:** `Role`, `Permission`, `UserRole`, `GroupRole` (see [Data Model](#data-model)).
- **System roles:** `admin`, `user`, `guest`; **org-scoped roles:** `owner`, `admin`, `member`.
- **Resolution:** permissions are collected from a user's direct roles **plus** the roles of
  their groups, deduplicated and ordered by `priority`. A `*` permission grants everything;
  pattern permissions (e.g. `org:*`) match by prefix.
- **Caching:** resolved permissions are cached in Redis for ~5 minutes
  (`permission:{userId}:{permission}:{orgId}:{appId}:{serviceName}`).
- **Middleware:** `requireAuth`, `requireEmailVerified`, `requireMFA`, `adminAuth`, and
  `rbac(...)` permission checks.

Key service functions: `checkPermission`, `assignRoleToUser` / `revokeRoleFromUser`,
`assignRoleToGroup` / `revokeRoleFromGroup`, `getUserPermissions`, `checkApplicationAccess`,
`checkServiceAccess`.

### Roles & permissions endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` / `POST` | `/api/roles` | List / create roles |
| `GET` / `PATCH` / `DELETE` | `/api/roles/:id` | Read / update / delete (custom roles only) |
| `POST` | `/api/roles/:id/assign-user` · `/revoke-user` | Manage user assignments |
| `POST` | `/api/roles/:id/assign-group` · `/revoke-group` | Manage group assignments |
| `GET` | `/api/permissions` | List permissions |
| `GET` | `/api/users/:userId/permissions` | Resolved permissions for a user |
| `POST` | `/api/check-permission` | Check a permission |
| `POST` | `/api/check-service-access` | Check access to a service |

---

## Organizations & Multi-Tenancy

`src/services/organizationService.js` (models `Organization`, `OrganizationMember`). Only the
**owner** may delete an org or transfer ownership; **owner/admin** may manage members; members
may view. Roles follow `owner > admin > member`.

| Method | Path | Description |
|--------|------|-------------|
| `POST` / `GET` | `/api/organizations` | Create / list caller's orgs |
| `GET` / `PATCH` / `DELETE` | `/api/organizations/:id` | Read / update / delete |
| `GET` / `POST` | `/api/organizations/:id/members` | List / add members |
| `DELETE` / `PATCH` | `/api/organizations/:id/members/:userId` | Remove / change member role |
| `POST` | `/api/organizations/:id/transfer-ownership` | Transfer ownership |

---

## Sessions

`src/routes/sessions.js` (model `Session`). All endpoints require an authenticated session.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/sessions` | List active sessions for the user |
| `GET` | `/api/sessions/current` | Current session details |
| `DELETE` | `/api/sessions/:id` | Revoke a specific session |
| `DELETE` | `/api/sessions` | Revoke all sessions except current |
| `POST` | `/api/sessions/refresh` | Extend session expiry |

---

## CA Token Integration

`src/services/tokenService.js` (and `src/services/caService.js`) delegate the platform's
capability-token lifecycle to [Exprsn-CA](./exprsn-ca.md) over HTTP (`axios`, with an
`X-Service-Name: exprsn-auth` header):

| Operation | Calls Exprsn-CA |
|-----------|-----------------|
| **Generate** | `POST {CA_URL}/api/tokens/generate` — payload includes `userId`, aggregated `permissions`, `resourceType: "url"`, `resourceValue: "*"`, `expiryType: "time"`, `expirySeconds: 3600`, and `tokenData` (email, displayName, group names). |
| **Validate** | `POST {CA_URL}/api/tokens/validate` — checks required permissions / resource. |
| **Revoke** | `POST {CA_URL}/api/tokens/{tokenId}/revoke` — default reason `"User logout"`. |

Timeouts are ~10s for generation and ~5s for validation/revocation. Permissions are aggregated
from the user's group memberships before a token is requested.

### Auth-side token endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/tokens/generate` | Generate a CA token (CA-token protected) |
| `POST` | `/api/tokens/validate` | Validate a CA token |
| `POST` | `/api/tokens/revoke` | Revoke a CA token |

---

## Billing & Subscriptions

Backed by the top-level billing models and `routes/billing.js`. Subscriptions carry a **tier**
(`free`, `pro`, `max`, `premium`, `team_small`, `team_growing`, `team_scale`, `enterprise`) and
a **billing cycle** (`monthly`/`annual`). Usage is metered via `UsageRecord`, billed via
`Invoice`, and gated per-tier via `FeatureFlag` (categories: service, integration, storage,
compute, security, support — seeded at install).

Representative endpoints: `GET /api/subscriptions/user/:userId`,
`GET /api/subscriptions/organization/:organizationId`, `POST /api/subscriptions`,
`PATCH /api/subscriptions/:id`, `DELETE /api/subscriptions/:id`, `GET /api/invoices`,
`POST /api/usage-records`, `GET /api/feature-flags`.

> Billing lives in the legacy top-level layer; treat it as supporting metadata rather than a
> payment processor (payments are handled by the separate `exprsn-payments` service).

---

## Email Service

`src/services/emailService.js` supports multiple providers selected by `EMAIL_PROVIDER`
(`smtp` | `sendgrid` | `ses` | `mailgun`) with a common `EMAIL_FROM` sender. Provider config:
SMTP (`SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`), SendGrid
(`SENDGRID_API_KEY`), SES (AWS region/credentials), Mailgun (`MAILGUN_API_KEY`,
`MAILGUN_DOMAIN`). Templates are Handlebars-based and cached.

Templates in `src/templates/emails/` (HTML + text): `verification`, `welcome`,
`password-reset`, `security-alert`, `mfa-backup-codes`. Methods include
`sendVerificationEmail`, `sendWelcomeEmail`, `sendPasswordResetEmail`, and
`sendSecurityAlertEmail`.

---

## HTTP API Reference

> Unless noted, `/api/*` endpoints return JSON. Session-protected endpoints use `requireAuth`;
> service-to-service endpoints validate a CA token (`validateCAToken`); login/registration and
> sensitive flows are rate-limited (`strictLimiter`).

### Authentication — `/api/auth`

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/register` | Register; send email verification |
| `POST` | `/api/auth/login` | Local login; returns a CA token |
| `POST` | `/api/auth/logout` | Logout / revoke session |
| `POST` | `/api/auth/forgot-password` | Begin password reset |
| `POST` | `/api/auth/reset-password` | Complete password reset |
| `POST` | `/api/auth/verify-email` | Verify email token |
| `POST` | `/api/auth/resend-verification` | Resend verification email |
| `POST` | `/api/auth/change-password` | Change password (authenticated) |
| `GET` | `/api/auth/me` | Current user profile |
| `GET` | `/api/auth/google` · `/google/callback` | Google OAuth flow |
| `GET` | `/api/auth/github` · `/github/callback` | GitHub OAuth flow |

### Users — `/api/users`

| Method | Path | Description |
|--------|------|-------------|
| `GET` / `PUT` / `DELETE` | `/api/users/:id` | Read / update / deactivate (CA-token protected) |
| `GET` | `/api/users/:id/groups` | User's groups |

### Groups — `/api/groups`

| Method | Path | Description |
|--------|------|-------------|
| `POST` / `GET` / `PUT` / `DELETE` | `/api/groups[/:id]` | CRUD (CA-token protected) |
| `POST` | `/api/groups/:id/members` | Add member |
| `DELETE` | `/api/groups/:id/members/:userId` | Remove member |

### Applications / OAuth2 clients — `/api/applications`

| Method | Path | Description |
|--------|------|-------------|
| `POST` / `GET` | `/api/applications` | Create / list |
| `GET` / `PATCH` / `DELETE` | `/api/applications/:id` | Read / update / delete |
| `POST` | `/api/applications/:id/regenerate-secret` | Rotate client secret |
| `GET` | `/api/applications/:id/check-access` | Check user access |

### Health — `/health`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Basic liveness |
| `GET` | `/health/db` | Database check |
| `GET` | `/health/ca` | CA reachability check |

### Setup config — `/api/config`

`GET|POST /api/config/:sectionId` — read/update auth configuration sections (used by the central
Setup service; not auth-gated — restrict at the network layer).

Plus the [OAuth2](#oauth2-provider), [OIDC](#openid-connect-oidc), [SAML](#saml-20-sso),
[MFA](#multi-factor-authentication), [Sessions](#sessions), [RBAC](#role-based-access-control-rbac),
[Organizations](#organizations--multi-tenancy), [LDAP](#ldap--active-directory),
[Tokens](#ca-token-integration), and [Billing](#billing--subscriptions) endpoints documented
above.

---

## Web UI Routes

Server-rendered EJS pages (`src/routes/public.js`, `src/routes/admin.js`, `src/routes/setup.js`):

| Path | Page |
|------|------|
| `GET /` | Redirect to `/login` or `/dashboard` |
| `GET /login`, `POST /login` | Login (rate-limited) |
| `GET /register`, `POST /register` | Registration |
| `GET /dashboard` | User dashboard (auth required) |
| `POST /logout` | Logout |
| `GET /forgot-password`, `POST /forgot-password` | Password-reset request |
| `GET /reset-password`, `POST /reset-password` | Password reset with token |
| `GET /admin`, `/admin/users`, … | Admin console (admin only) |
| `GET /setup`, `/setup/*` | First-run setup wizard (system, users, roles, groups, OAuth2, OIDC, SAML tabs) |

---

## Running the Service

```bash
cd src/exprsn-auth
cp .env.example .env
npm install

# Development (hot reload)
npm run dev          # nodemon src/index.js

# Production
npm start            # node src/index.js

# Database
npm run migrate
npm run seed
```

Exprsn-CA should be running first (or set `CA_REQUIRED=false` / `CA_WAIT=true` to tolerate a
delayed CA). From the monorepo root you can also use `npm run dev:auth`.

---

## Testing

Jest suites live in `tests/` (helpers in `tests/helpers/testDatabase.js`, bootstrap in
`tests/setup.js`):

| Suite | Coverage |
|-------|----------|
| `auth.test.js` | Registration, login, logout, password reset |
| `mfa.test.js` | TOTP setup/verify, backup codes, disable |
| `session.test.js` | Session create / refresh / revoke |
| `oauth2.test.js` | Authorization code, token endpoint, PKCE |
| `saml.test.js` | Metadata, login, callback, logout |
| `organization.test.js` | Org CRUD, members, permissions |
| `rbac.test.js` | Role assignment, permission checks, caching |
| `passwordService.test.js` | Password validation & strength rules |

```bash
npm test                 # all suites
npm run test:coverage    # with coverage
npm run test:integration # jest.integration.config.js
```

---

## Security Considerations

- **Change `SESSION_SECRET`** and run behind HTTPS (`TLS_ENABLED=true`, secure cookies) in production.
- **Strong password policy** is enforced server-side (12+ chars, complexity, no weak/sequential).
- **Account lockout** after 5 failed logins for 15 minutes mitigates brute force; MFA endpoints are additionally rate-limited.
- **OAuth2:** prefer PKCE for public clients; validate `redirect_uri`; use `state`; rotate client secrets via the Applications API.
- **SAML:** validate signatures and audience; configure SLO; protect IdP metadata.
- **CA dependency:** when `CA_REQUIRED=true`, token issuance fails closed if Exprsn-CA is down — plan availability accordingly.
- **Unauthenticated surfaces:** `/setup/*` and `/api/config/*` are not auth-gated by design; firewall them after initial setup.
- **Secrets:** keep `ENCRYPTION_KEY`, DB, Redis, and provider credentials out of source control.

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Startup hangs or fails on CA init | Exprsn-CA not reachable at `CA_URL`. Start CA first, or set `CA_REQUIRED=false`. |
| Login token not issued | CA token generation failed — check CA health (`GET /health/ca`) and `CA_URL`. |
| Session not persisting | Cookie/secure mismatch — align `TLS_ENABLED`/secure cookies with the protocol; verify Redis if Redis-backed sessions are enabled. |
| MFA code rejected | Server clock drift — sync NTP (TOTP allows ±2 steps). |
| OAuth2 `redirect_uri` mismatch | Registered client `redirectUris` must exactly match the request. |
| SAML assertion rejected | Check IdP metadata, certificate, and audience/clock skew. |
| Account locked | 5 failed logins → 15-minute lockout (`lockedUntil`). |

---

## Related Documentation

- [Exprsn-CA — Certificate Authority & Token Service](./exprsn-ca.md)
- Platform overview: repository [`README.md`](../README.md)
- Wiki: `wiki/services/exprsn-auth.md`, `wiki/architecture/System-Architecture.md`
