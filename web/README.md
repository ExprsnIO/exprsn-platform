# Exprsn Web — unified frontend

Single-origin SPA (Vite + React + TypeScript) for the Exprsn Platform. The
backend modules are JSON-only APIs behind one HTTPS gateway; this app is a
separate static build artifact — it is **not** served by any Express module.

## Run

**Dev** (Vite dev server proxies the gateway on `:8443`, self-signed cert OK):

```bash
npm --prefix web install     # or: npm run web:install   (from repo root)
npm run web:dev              # http://localhost:5173
```

The dev server is the single origin: API prefixes (`/ca /auth /spark … /live`),
`/health`, and `/socket.io` are proxied to `https://localhost:8443`
(`vite.config.ts`). Override the target with `VITE_GATEWAY_ORIGIN`.

**Prod** (static bundle served by the nginx edge on 443, same origin as the API):

```bash
npm run web:build           # -> web/dist
# nginx mounts web/dist read-only and serves it with SPA history fallback
# (docker/nginx/nginx.conf); recreate it after a build:
docker compose --profile extras --profile optional up -d --force-recreate nginx
# then: https://localhost/  (or https://exprsn.local/)
```

## Layout

```
src/
  app/        router, root layout, providers (QueryClient + MUI theme), store (zustand)
  lib/        http.ts (fetch wrapper + ApiError), token.ts (bearer holder), config.ts
  api/        one client per backend prefix (platform, auth, … added per phase)
  features/   one folder per backend domain (health live; rest are placeholders)
```

## Key facts (drive everything)

- **Same origin always.** API base is `''` (relative). The gateway refuses
  wildcard CORS with credentials, so the SPA must share the gateway origin — via
  the Vite proxy in dev, via nginx in prod. Never point the client at a
  cross-origin gateway URL.
- **Module APIs are bearer-only.** `@exprsn/shared` `authenticate()` reads only
  `Authorization: Bearer <CA token>` — no cookie fallback. Login also sets a
  passport session cookie (used only by the OIDC `authorize` flow). The SPA
  keeps the bearer in memory (`lib/token.ts`) and sends it on every call.
- **Reload rehydration (Phase 2 TODO).** There is no session→token re-mint
  endpoint today (`/auth/api/auth/me` returns the user only). Recommended
  backend addition: `POST /auth/api/auth/token` (session-authed) →
  `tokenService.generateToken(req.user)`. Until then the bearer is lost on hard
  reload and the user must re-auth.
- **Client routes avoid backend prefixes.** Nav uses `/messages /feed /files
  /groups /streams /moderation /secrets /certs` so they don't collide with the
  module prefixes the proxy/edge own. API calls still target the real prefixes
  (`/spark/api/...`).
- **Realtime:** one Socket.IO connection (`/socket.io`), namespaces per module
  (`/spark /timeline /live /vault /moderation /notifications /ca`). Added in
  Phase 3 (`lib/realtime.ts`).

## Roadmap

Phase 1 (done): scaffold + Health page through the proxy. Phase 2: auth
(login/MFA/SSO + guards). Phase 3: API/realtime infra. Phase 4: MVP domains
(spark, timeline, account). Phase 5+: filevault, nexus, notifications, live,
admin consoles. See the plan in the project history for detail.
