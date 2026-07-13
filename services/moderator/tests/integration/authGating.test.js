/**
 * ═══════════════════════════════════════════════════════════
 * Auth-Gating Integration Tests (BUG-010 / SPIKE-001)
 *
 * Verifies the six formerly-unauthenticated moderator routers are gated:
 *  - the four P1 mutation paths reject unauthenticated callers (401);
 *  - submit handlers bind the actor to the VALIDATED token, not the body
 *    (a spoofed reportedBy/userId/reviewerId has no effect);
 *  - an admin-only read rejects a valid non-admin bearer (403);
 *  - the moderation service-ingest paths require a valid HMAC service token.
 *
 * External I/O is mocked exactly like the sibling integration suites: the CA
 * `POST /api/tokens/validate` call (axios) that `requireAdmin`/`requireUser`
 * make, and the appeal service (so appellant/reviewer binding is asserted on
 * the received arg). The reporter-binding case uses the real `Report` model so
 * the PERSISTED value is asserted. The shared `tests/integration/setup.js`
 * force-syncs the isolated test DB.
 * ═══════════════════════════════════════════════════════════
 */

// A valid (non-placeholder, >=32 char) service secret so deriveServiceToken /
// verifyServiceToken agree on the HMAC in this process.
process.env.SERVICE_TOKEN_SECRET =
  'a0b1c2d3e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeeff';
process.env.SERVICE_ID = 'platform';

// Mock the CA validate call (axios.post) — matches the sibling suites' factory
// shape (post/get only; no axios.create at module load).
jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));

// Mock the appeal service so submit/review handlers don't touch its internals;
// lets us assert the actor arg the router passes in.
jest.mock('../../services/appealService', () => ({
  submitAppeal: jest.fn().mockResolvedValue({ id: 'appeal-1', status: 'pending' }),
  reviewAppeal: jest.fn().mockResolvedValue({ id: 'appeal-1', status: 'approved' }),
  getAppeal: jest.fn(),
  getAppealsForUser: jest.fn(),
  getPendingAppeals: jest.fn(),
  getAppealStats: jest.fn(),
  getAppealHistory: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const axios = require('axios');
const { deriveServiceToken } = require('@exprsn/shared/utils/serviceToken');

const appealService = require('../../services/appealService');
const { Report } = require('../../models/sequelize-index');

// Require setup for its exported DB helpers + to ensure the shared beforeAll/
// afterEach hooks (schema sync + truncate) are registered for this file.
require('./setup');

// ── Identities ──────────────────────────────────────────────
const TOKEN_USER = 'aaaaaaaa-1111-4111-8111-000000000001'; // valid, non-admin
const ADMIN_USER = 'bbbbbbbb-2222-4222-8222-000000000002'; // valid admin
const SPOOF_USER = 'cccccccc-3333-4333-8333-000000000003'; // attacker-supplied

const SERVICE_TOKEN = deriveServiceToken('platform');

/** Make axios.post (CA validate) resolve a given token shape. */
function mockValidate({ valid = true, userId = TOKEN_USER, roles = [], email = 'u@x.io' } = {}) {
  axios.post.mockResolvedValue({
    data: valid ? { valid: true, userId, tokenData: { email, roles } } : { valid: false }
  });
}

// Build a minimal gateway mounting the six routers at their real prefixes.
function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/moderate', require('../../routes/moderation'));
  app.use('/api/queue', require('../../routes/review'));
  app.use('/api/reports', require('../../routes/reports'));
  app.use('/api/appeals', require('../../routes/appeals'));
  app.use('/api/actions', require('../../routes/actions'));
  app.use('/api/metrics', require('../../routes/metrics'));
  return app;
}

const app = buildApp();

describe('BUG-010 — moderator router auth-gating', () => {
  describe('A1 — P1 mutation paths reject unauthenticated calls (401)', () => {
    it('POST /api/actions/execute → 401 without a bearer', async () => {
      const res = await request(app).post('/api/actions/execute').send({
        actionType: 'remove', contentType: 'post', contentId: 'c1', sourceService: 'timeline'
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/queue/:id/remove → 401 without a bearer', async () => {
      const res = await request(app).post('/api/queue/some-id/remove').send({ reason: 'x' });
      expect(res.status).toBe(401);
    });

    it('PUT /api/reports/:id/resolve → 401 without a bearer', async () => {
      const res = await request(app).put('/api/reports/some-id/resolve').send({ resolvedBy: 'm' });
      expect(res.status).toBe(401);
    });

    it('POST /api/appeals/:id/review → 401 without a bearer', async () => {
      const res = await request(app).post('/api/appeals/some-id/review').send({
        decision: 'approve', notes: 'ok'
      });
      expect(res.status).toBe(401);
    });
  });

  describe('A1 — submit actor is bound to the validated token, not the body', () => {
    it('reports POST / persists reportedBy from req.userId, ignoring a spoofed body value', async () => {
      mockValidate({ userId: TOKEN_USER });

      const res = await request(app)
        .post('/api/reports')
        .set('Authorization', 'Bearer valid-user-token')
        .send({
          contentType: 'post',
          contentId: 'content-xyz',
          sourceService: 'timeline',
          reason: 'spam',
          details: 'nope',
          reportedBy: SPOOF_USER // spoof — must be ignored
        });

      expect(res.status).toBe(200);
      const persisted = await Report.findByPk(res.body.report.id);
      expect(persisted).toBeTruthy();
      expect(persisted.reportedBy).toBe(TOKEN_USER);
      expect(persisted.reportedBy).not.toBe(SPOOF_USER);
    });

    it('appeals POST / passes req.userId as appellant, ignoring a spoofed body userId', async () => {
      mockValidate({ userId: TOKEN_USER });

      const res = await request(app)
        .post('/api/appeals')
        .set('Authorization', 'Bearer valid-user-token')
        .send({
          moderationItemId: 'mi-1',
          reason: 'please reconsider',
          userId: SPOOF_USER // spoof — must be ignored
        });

      expect(res.status).toBe(201);
      expect(appealService.submitAppeal).toHaveBeenCalledTimes(1);
      expect(appealService.submitAppeal.mock.calls[0][0]).toBe(TOKEN_USER);
      expect(appealService.submitAppeal.mock.calls[0][0]).not.toBe(SPOOF_USER);
    });

    it('appeals POST /:id/review passes req.userId as reviewer, ignoring a spoofed reviewerId', async () => {
      mockValidate({ userId: ADMIN_USER, roles: ['admin'] });

      const res = await request(app)
        .post('/api/appeals/appeal-1/review')
        .set('Authorization', 'Bearer valid-admin-token')
        .send({
          decision: 'approve',
          notes: 'looks fine',
          reviewerId: SPOOF_USER // spoof — must be ignored
        });

      expect(res.status).toBe(200);
      expect(appealService.reviewAppeal).toHaveBeenCalledTimes(1);
      // reviewAppeal(id, reviewerId, decision, notes)
      expect(appealService.reviewAppeal.mock.calls[0][1]).toBe(ADMIN_USER);
      expect(appealService.reviewAppeal.mock.calls[0][1]).not.toBe(SPOOF_USER);
    });
  });

  describe('A2 — admin read rejects a valid non-admin bearer (403)', () => {
    it('GET /api/metrics → 403 for a valid non-admin token', async () => {
      mockValidate({ userId: TOKEN_USER, roles: [] });

      const res = await request(app)
        .get('/api/metrics')
        .set('Authorization', 'Bearer valid-user-token');

      expect(res.status).toBe(403);
    });

    it('GET /api/metrics → 200 for a valid admin token', async () => {
      mockValidate({ userId: ADMIN_USER, roles: ['admin'] });

      const res = await request(app)
        .get('/api/metrics')
        .set('Authorization', 'Bearer valid-admin-token');

      expect(res.status).toBe(200);
    });
  });

  describe('A1 — moderation ingest requires a valid HMAC service token', () => {
    it('POST /api/moderate/content → 401 without a service token', async () => {
      const res = await request(app).post('/api/moderate/content').send({
        contentType: 'post', contentId: 'c1', sourceService: 'timeline', userId: TOKEN_USER, contentText: 'hi'
      });
      expect(res.status).toBe(401);
    });

    it('POST /api/moderate/content → 401 with an invalid service token', async () => {
      const res = await request(app)
        .post('/api/moderate/content')
        .set('X-Service-ID', 'platform')
        .set('X-Service-Token', 'not-the-real-hmac')
        .send({ contentType: 'post', contentId: 'c1', sourceService: 'timeline', userId: TOKEN_USER, contentText: 'hi' });
      expect(res.status).toBe(401);
    });

    it('POST /api/moderate/content → passes the gate with a valid service token (400 on empty body, not 401)', async () => {
      const res = await request(app)
        .post('/api/moderate/content')
        .set('X-Service-ID', 'platform')
        .set('X-Service-Token', SERVICE_TOKEN)
        .send({});
      expect(res.status).toBe(400); // reached the handler's field validation
    });

    it('POST /api/moderate/batch → 401 without a service token', async () => {
      const res = await request(app).post('/api/moderate/batch').send({ items: [] });
      expect(res.status).toBe(401);
    });

    it('POST /api/moderate/batch → passes the gate with a valid service token (400 on empty body, not 401)', async () => {
      const res = await request(app)
        .post('/api/moderate/batch')
        .set('X-Service-ID', 'platform')
        .set('X-Service-Token', SERVICE_TOKEN)
        .send({});
      expect(res.status).toBe(400);
    });
  });
});
