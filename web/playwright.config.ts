import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config (TASK-001). Drives the real SPA against the real gateway:
 *
 *  - Gateway must already be running on E2E_GATEWAY_ORIGIN
 *    (default https://localhost:8443 — `NODE_TLS_REJECT_UNAUTHORIZED=0 npm start`
 *    from the repo root, with `npm run infra:up` done first).
 *  - The SPA is served by the Vite dev server on :5173 (started automatically
 *    below via `webServer` unless one is already up). To point at another
 *    origin instead (e.g. the nginx-served build on https://localhost),
 *    set E2E_BASE_URL — the auto-started dev server is skipped in that case.
 *
 * TLS is dev self-signed on both :8443 and :443 → ignoreHTTPSErrors.
 */
const SPA_ORIGIN = process.env.E2E_BASE_URL || 'http://localhost:5173';
const usingDefaultDevServer = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: SPA_ORIGIN,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
  },
  ...(usingDefaultDevServer
    ? {
        webServer: {
          command: 'npm run dev',
          url: SPA_ORIGIN,
          reuseExistingServer: true,
          timeout: 60_000,
        },
      }
    : {}),
});
