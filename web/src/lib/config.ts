/**
 * Frontend runtime config. The SPA is served from the SAME ORIGIN as the
 * gateway in production (nginx serves web/dist on :443, API prefixes proxy to
 * the Node gateway). In dev, the Vite proxy makes the dev server the single
 * origin. Either way the API base is '' (relative) — never a cross-origin URL,
 * which keeps credentialed requests same-origin (the gateway refuses wildcard
 * CORS with credentials).
 */
export const config = {
  // Relative base — same origin as wherever the SPA is served.
  apiBase: '',
  // Backend module prefixes (mirror src/modules/registry.js).
  modules: [
    'ca',
    'auth',
    'spark',
    'nexus',
    'filevault',
    'vault',
    'timeline',
    'prefetch',
    'moderator',
    'live',
    'cortex',
  ] as const,
} as const;

export type ModuleName = (typeof config.modules)[number];
