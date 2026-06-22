/**
 * In-memory holder for the bearer (CA) token used on every module API call.
 *
 * Module REST APIs are strictly bearer-only (@exprsn/shared `authenticate()`
 * reads only `Authorization: Bearer` — no cookie fallback), so the SPA must
 * carry this token. We keep it in memory (not localStorage) to limit XSS token
 * theft. On hard reload it is lost; rehydration is handled by the auth layer
 * (Phase 2) — ideally via a small session-authed `POST /auth/api/auth/token`
 * re-mint endpoint on the backend.
 */
let token: string | null = null;

export const tokenStore = {
  get: () => token,
  set: (t: string | null) => {
    token = t;
  },
  clear: () => {
    token = null;
  },
};
