/**
 * ═══════════════════════════════════════════════════════════
 * Reports Route — double-report guard (FEAT-010)
 *
 * A user-facing report submit path (POST /api/reports, requireUser-gated on this
 * branch) must not let the same user report the same item twice. The guard is an
 * app-level pre-check that returns a clean, idempotent 409 (`ALREADY_REPORTED`)
 * — NOT a 500 — carrying the existing report's id/status.
 *
 * External I/O is mocked like the sibling suites: the CA `POST /api/tokens/validate`
 * call (axios) that requireUser makes. The real `Report` model persists to the
 * isolated test DB force-synced by tests/integration/setup.js.
 * ═══════════════════════════════════════════════════════════
 */

process.env.SERVICE_TOKEN_SECRET =
  'a0b1c2d3e4f5061728394a5b6c7d8e9f00112233445566778899aabbccddeeff';
process.env.SERVICE_ID = 'platform';

jest.mock('axios', () => ({ post: jest.fn(), get: jest.fn() }));

const express = require('express');
const request = require('supertest');
const axios = require('axios');

const { Report } = require('../../models/sequelize-index');

require('./setup');

const TOKEN_USER = 'aaaaaaaa-1111-4111-8111-000000000001';
const OTHER_USER = 'bbbbbbbb-2222-4222-8222-000000000002';

function mockValidate(userId = TOKEN_USER) {
  axios.post.mockResolvedValue({
    data: { valid: true, userId, tokenData: { email: 'u@x.io', roles: [] } }
  });
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/reports', require('../../routes/reports'));
  return app;
}

const app = buildApp();

const body = {
  contentType: 'post',
  contentId: 'content-dup-1',
  sourceService: 'timeline',
  reason: 'spam',
  details: 'first report'
};

describe('FEAT-010 — reports double-report guard', () => {
  it('first report by a user succeeds (200) and persists one row', async () => {
    mockValidate(TOKEN_USER);
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', 'Bearer valid-user-token')
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const count = await Report.count({ where: { contentId: 'content-dup-1' } });
    expect(count).toBe(1);
  });

  it('a second report of the SAME item by the SAME user is rejected cleanly (409, not 500)', async () => {
    mockValidate(TOKEN_USER);
    await request(app)
      .post('/api/reports')
      .set('Authorization', 'Bearer valid-user-token')
      .send(body)
      .expect(200);

    const dup = await request(app)
      .post('/api/reports')
      .set('Authorization', 'Bearer valid-user-token')
      .send({ ...body, details: 'second attempt' });

    expect(dup.status).toBe(409);
    expect(dup.status).not.toBe(500);
    expect(dup.body.error).toBe('ALREADY_REPORTED');
    expect(dup.body.report).toHaveProperty('id');

    // No duplicate row was created.
    const count = await Report.count({ where: { contentId: 'content-dup-1' } });
    expect(count).toBe(1);
  });

  it('a DIFFERENT user reporting the same item is allowed', async () => {
    mockValidate(TOKEN_USER);
    await request(app)
      .post('/api/reports')
      .set('Authorization', 'Bearer valid-user-token')
      .send(body)
      .expect(200);

    mockValidate(OTHER_USER);
    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', 'Bearer other-user-token')
      .send(body);

    expect(res.status).toBe(200);
    const count = await Report.count({ where: { contentId: 'content-dup-1' } });
    expect(count).toBe(2);
  });

  it('the same user reporting a DIFFERENT item is allowed', async () => {
    mockValidate(TOKEN_USER);
    await request(app)
      .post('/api/reports')
      .set('Authorization', 'Bearer valid-user-token')
      .send(body)
      .expect(200);

    const res = await request(app)
      .post('/api/reports')
      .set('Authorization', 'Bearer valid-user-token')
      .send({ ...body, contentId: 'content-dup-2' });

    expect(res.status).toBe(200);
  });
});
