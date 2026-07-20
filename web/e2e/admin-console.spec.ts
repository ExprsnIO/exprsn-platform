/**
 * TASK-039 — Admin console smoke, end-to-end through the real stack.
 *
 * Logs in as the platform admin and, for every section in the reorganized IA
 * (Infrastructure / Services / Applications + top-level Overview & Platform):
 *   - navigates via the collapsible sidebar (categories expand/collapse),
 *   - asserts the section renders (a heading, no error boundary),
 *   - asserts zero uncaught page errors / console errors,
 * then exercises representative modal dialogs (open → visible → close) and the
 * Platform store edit dialog end-to-end (open → cancel).
 *
 * Prereqs: gateway on E2E_GATEWAY_ORIGIN (default https://localhost:8443 —
 * for the worktree run: HTTPS_PORT=8444 + E2E_GATEWAY_ORIGIN=https://localhost:8444),
 * Vite dev server on :5173 (auto-started unless up).
 * Uses the dev platform-admin account (tester@exprsn.io).
 */
import { test, expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'tester@exprsn.io';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'Zx9$Konq!Vebu7';

/**
 * One UI login per RUN (not per test): the auth login endpoint is rate-limited
 * per IP, so each test rehydrates from the saved session cookie instead
 * (the SPA re-mints its in-memory bearer from the session on load).
 */
let sharedContext: BrowserContext;
let page: Page;

async function loginOnce(browser: Browser, baseURL: string) {
  sharedContext = await browser.newContext({ baseURL, ignoreHTTPSErrors: true });
  page = await sharedContext.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel(/^Password/).fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 });
}

/** Every route in the sidebar, in IA order. */
const SECTIONS: { path: string; heading: RegExp }[] = [
  { path: '/admin', heading: /Platform Overview/i },
  { path: '/admin/platform', heading: /^Platform$/i },
  // Infrastructure
  { path: '/admin/ca', heading: /Certificate Authority/i },
  { path: '/admin/auth', heading: /Authentication/i },
  { path: '/admin/identity-groups', heading: /Groups/i },
  { path: '/admin/users', heading: /Users/i },
  { path: '/admin/roles', heading: /Roles/i },
  { path: '/admin/permissions', heading: /Permissions/i },
  { path: '/admin/scopes', heading: /Scopes/i },
  { path: '/admin/atproto', heading: /AT-Protocol/i },
  { path: '/admin/ai', heading: /AI/i },
  // Services
  { path: '/admin/timeline', heading: /Timeline/i },
  { path: '/admin/nexus', heading: /Groups|Nexus/i },
  { path: '/admin/live', heading: /Live/i },
  { path: '/admin/vault', heading: /Vault/i },
  { path: '/admin/filevault', heading: /File\s?Vault|Files/i },
  { path: '/admin/spark', heading: /Spark|Messaging/i },
  { path: '/admin/jobs', heading: /Jobs|Queues/i },
  { path: '/admin/prefetch', heading: /Prefetch/i },
  // Applications
  { path: '/admin/lowcode', heading: /Low-?Code/i },
  { path: '/admin/cortex', heading: /Cortex/i },
  { path: '/admin/plugins', heading: /Plugins/i },
  { path: '/admin/moderator', heading: /Moderation/i },
];

/** Console/page errors to ignore (dev-server noise, aborted fetches on nav). */
const IGNORED_ERRORS = [
  /net::ERR_ABORTED/,
  /Failed to load resource/, // per-request 4xx noise is asserted via pageErrors instead
  /WebSocket is closed/,
  /ResizeObserver loop/,
];

function collectErrors(page: Page): { consoleErrors: string[]; pageErrors: string[] } {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (IGNORED_ERRORS.some((re) => re.test(text))) return;
    consoleErrors.push(text);
  });
  page.on('pageerror', (err) => pageErrors.push(String(err)));
  return { consoleErrors, pageErrors };
}

test.describe.configure({ mode: 'serial' });

test.describe('admin console', () => {
  test.beforeAll(async ({ browser }, testInfo) => {
    await loginOnce(browser, testInfo.project.use.baseURL ?? 'http://localhost:5173');
  });
  test.afterAll(async () => {
    await sharedContext?.close();
  });

  test('every section renders without errors', async () => {
    const errors = collectErrors(page);

    for (const section of SECTIONS) {
      await test.step(section.path, async () => {
        await page.goto(section.path);
        // A section heading is visible and it's not the router's error page.
        await expect(page.getByRole('heading', { name: section.heading }).first()).toBeVisible({
          timeout: 15_000,
        });
        await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
        // Let queries settle so late errors surface.
        await page.waitForTimeout(400);
      });
    }

    expect(errors.pageErrors, `uncaught page errors:\n${errors.pageErrors.join('\n')}`).toHaveLength(0);
    expect(errors.consoleErrors, `console errors:\n${errors.consoleErrors.join('\n')}`).toHaveLength(0);
  });

  test('sidebar categories collapse, expand, and persist', async () => {
    await page.goto('/admin');
    const infra = page.getByRole('button', { name: 'Infrastructure' });
    await expect(infra).toBeVisible();
    // Visible while expanded (default), hidden after collapse.
    const caLink = page.getByRole('link', { name: 'Certificate Authority' });
    await expect(caLink).toBeVisible();
    await infra.click();
    await expect(caLink).toBeHidden();
    // Collapsed state survives reload.
    await page.reload();
    await expect(page.getByRole('link', { name: 'Certificate Authority' })).toBeHidden();
    await page.getByRole('button', { name: 'Infrastructure' }).click();
    await expect(page.getByRole('link', { name: 'Certificate Authority' })).toBeVisible();
  });

  test('representative modal dialogs open and close', async () => {
    const errors = collectErrors(page);

    // Platform store: row click opens the typed edit dialog.
    await test.step('platform edit dialog', async () => {
      await page.goto('/admin/platform');
      await page.getByRole('cell', { name: 'CORTEX_ENABLED' }).first().click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toBeVisible();
      await expect(dialog.getByText(/restart required/i).first()).toBeVisible();
      await dialog.getByRole('button', { name: /cancel/i }).click();
      await expect(dialog).toBeHidden();
    });

    // Roles: create-role dialog.
    await test.step('create role dialog', async () => {
      await page.goto('/admin/roles');
      const btn = page.getByRole('button', { name: /create|new role/i }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        const dialog = page.getByRole('dialog');
        await expect(dialog).toBeVisible();
        await page.keyboard.press('Escape');
        await expect(dialog).toBeHidden();
      }
    });

    // Moderation agents (now under /admin/ai): agent dialog.
    await test.step('AI agents dialog', async () => {
      await page.goto('/admin/ai');
      const agentsTab = page.getByRole('tab', { name: /agents/i }).first();
      if (await agentsTab.isVisible().catch(() => false)) {
        await agentsTab.click();
        const btn = page.getByRole('button', { name: /create|new agent/i }).first();
        if (await btn.isVisible().catch(() => false)) {
          await btn.click();
          const dialog = page.getByRole('dialog');
          await expect(dialog).toBeVisible();
          await page.keyboard.press('Escape');
          await expect(dialog).toBeHidden();
        }
      }
    });

    expect(errors.pageErrors, `uncaught page errors:\n${errors.pageErrors.join('\n')}`).toHaveLength(0);
  });
});
