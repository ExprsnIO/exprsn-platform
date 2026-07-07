/**
 * TASK-001 — Core account flow, end-to-end through the real stack:
 *
 *   login → /settings → MFA enable wizard (QR renders; a generated TOTP code
 *   enables MFA, then disable it) → sessions list shows the active session and
 *   revoke invalidates it (revoked session's CA bearer 401s — SP-6).
 *
 * Self-contained & re-runnable: registers a fresh user per run via
 * `POST /auth/api/auth/register` (no email verification required to log in).
 * TOTP codes are generated with otplib from the base32 secret the wizard shows
 * (server verifies with speakeasy, window 2 — services/auth/routes/mfa.js).
 *
 * Prereqs: gateway on E2E_GATEWAY_ORIGIN (default https://localhost:8443);
 * the SPA dev server is auto-started by playwright.config.ts.
 */
import { test, expect, request as pwRequest, type APIRequestContext } from '@playwright/test';
// otplib v13: generate({ secret }) → Promise<string>, base32 secret, RFC-6238
// defaults (SHA-1 / 30s / 6 digits) — matches the server's speakeasy verify.
import { generate as generateTotp } from 'otplib';

const GATEWAY = process.env.E2E_GATEWAY_ORIGIN || 'https://localhost:8443';

const RUN_ID = Date.now();
const EMAIL = `e2e-account-${RUN_ID}@exprsn.io`;
const PASSWORD = 'E2e!Passw0rd#2026';
const NAME = 'E2E Account Flow';
/** Distinctive user-agent so the victim session's row is identifiable in the UI. */
const VICTIM_UA = `exprsn-e2e-victim/${RUN_ID}`;

let api: APIRequestContext;

test.beforeAll(async () => {
  api = await pwRequest.newContext({ baseURL: GATEWAY, ignoreHTTPSErrors: true });
  const res = await api.post('/auth/api/auth/register', {
    data: { email: EMAIL, password: PASSWORD, name: NAME },
  });
  expect(res.ok(), `register failed: ${res.status()} ${await res.text()}`).toBeTruthy();
});

test.afterAll(async () => {
  await api?.dispose();
});

test('login → settings → MFA enable/disable → session revoke invalidates bearer', async ({ page }) => {
  // ── Step 1: login through the SPA ─────────────────────────────────────────
  await test.step('login via /login lands on the app shell', async () => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(EMAIL);
    // MUI renders required labels as "Password *" → match by prefix.
    await page.getByLabel(/^Password/).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await page.waitForURL((u) => new URL(u).pathname === '/');
  });

  // ── Step 2: /settings renders (full reload → session must rehydrate) ──────
  await test.step('/settings renders the account page', async () => {
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Account settings' })).toBeVisible();
    await page.getByRole('tab', { name: 'Security' }).click();
    await expect(page.getByRole('heading', { name: 'Two-factor authentication' })).toBeVisible();
  });

  // ── Step 3: MFA enable wizard — QR renders, TOTP from the secret enables ──
  let totpSecret = '';
  await test.step('MFA wizard shows a QR code and base32 secret', async () => {
    await expect(page.getByText('Off', { exact: true })).toBeVisible(); // starts disabled
    await page.getByRole('button', { name: 'Enable 2FA' }).click();

    const qr = page.getByRole('img', { name: 'MFA QR code' });
    await expect(qr).toBeVisible();
    await expect(qr).toHaveAttribute('src', /^data:image\//); // PNG data URL actually rendered

    // The wizard's only <code> element is the manual-entry secret.
    totpSecret = ((await page.locator('code').first().textContent()) || '').trim();
    expect(totpSecret.length, 'manual-entry secret should be present').toBeGreaterThan(10);
  });

  await test.step('a generated TOTP code enables MFA', async () => {
    await page.getByLabel('Verification code').fill(await generateTotp({ secret: totpSecret }));
    await page.getByRole('button', { name: 'Verify & enable' }).click();
    await expect(page.getByText('On', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disable 2FA' })).toBeVisible();
  });

  // ── Step 4: disable MFA again (password-guarded dialog) ───────────────────
  await test.step('disable MFA via the password dialog', async () => {
    await page.getByRole('button', { name: 'Disable 2FA' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Disable two-factor authentication')).toBeVisible();
    await dialog.getByLabel(/^Password/).fill(PASSWORD);
    await dialog.getByRole('button', { name: 'Disable', exact: true }).click();
    await expect(page.getByText('Off', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Enable 2FA' })).toBeVisible();
  });

  // ── Step 5: second ("victim") session via the API ──────────────────────────
  let victimBearer = '';
  await test.step('a second login creates another session whose bearer works', async () => {
    const victim = await pwRequest.newContext({
      baseURL: GATEWAY,
      ignoreHTTPSErrors: true,
      userAgent: VICTIM_UA,
    });
    const login = await victim.post('/auth/api/auth/login', {
      data: { email: EMAIL, password: PASSWORD },
    });
    expect(login.ok(), `victim login failed: ${login.status()} ${await login.text()}`).toBeTruthy();
    victimBearer = (await login.json()).token;
    expect(victimBearer, 'login should mint a CA bearer token').toBeTruthy();
    await victim.dispose();

    // Bearer is live before revocation (send it WITHOUT any session cookie).
    const me = await api.get('/auth/api/auth/me', {
      headers: { Authorization: `Bearer ${victimBearer}` },
    });
    expect(me.status(), 'victim bearer should authenticate before revoke').toBe(200);
  });

  // ── Step 6: sessions list shows rows; revoke the victim session ───────────
  await test.step('sessions list shows the current session and the victim row', async () => {
    await page.getByRole('tab', { name: 'Sessions' }).click();
    await expect(page.getByText('This device')).toBeVisible(); // current session row (SP-6: rows persist)
    await expect(page.getByRole('row').filter({ hasText: VICTIM_UA })).toBeVisible();
  });

  await test.step('revoking the victim session removes the row', async () => {
    await page
      .getByRole('row')
      .filter({ hasText: VICTIM_UA })
      .getByRole('button', { name: 'Revoke' })
      .click();
    await expect(page.getByRole('row').filter({ hasText: VICTIM_UA })).toHaveCount(0);
    await expect(page.getByText('This device')).toBeVisible(); // current session survives
  });

  // ── Step 7: SP-6 — the revoked session's bearer must 401 ──────────────────
  await test.step('revoked session bearer 401s', async () => {
    await expect
      .poll(
        async () => {
          const res = await api.get('/auth/api/auth/me', {
            headers: { Authorization: `Bearer ${victimBearer}` },
          });
          return res.status();
        },
        { message: 'revoked bearer should stop authenticating', timeout: 10_000 },
      )
      .toBe(401);
  });

  // ── Step 8: current session is still healthy end-to-end ───────────────────
  await test.step('current UI session still works after revoking the other one', async () => {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Account settings' })).toBeVisible();
  });
});
