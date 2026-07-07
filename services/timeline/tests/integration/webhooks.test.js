/**
 * ═══════════════════════════════════════════════════════════
 * Webhook Routes Integration Tests
 *
 * Regression coverage for BUG-006:
 *   1. POST /api/webhooks/moderator must be authenticated (HMAC over the raw
 *      body via x-webhook-signature, keyed with MODERATOR_WEBHOOK_SECRET) —
 *      it must 503 when unconfigured and 401 without a valid signature, just
 *      like its /bluesky sibling.
 *   2. A valid moderation decision must MERGE moderation fields into the
 *      post's existing metadata (preserving metadata.approval) rather than
 *      clobbering the whole metadata object.
 * ═══════════════════════════════════════════════════════════
 */

// Dummy key so @exprsn/shared's stripeService can construct at require time
// (it throws "Neither apiKey nor config.authenticator provided" otherwise).
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_dummy';

const express = require('express');
const crypto = require('crypto');
const request = require('supertest');

// Mock the models the webhooks router imports. `resetMocks: true` (jest.config)
// clears these between tests, so implementations are set per-test below.
const mockPost = {
  findByPk: jest.fn(),
  update: jest.fn()
};
jest.mock('../../src/models', () => ({ Post: mockPost }));

const webhookRoutes = require('../../src/routes/webhooks');
const { Post } = require('../../src/models');

const SECRET = 'test-moderator-webhook-secret';

/**
 * Minimal app that reproduces the module's real wiring for this router:
 * express.json with the raw-body verify hook (src/index.js) + the router
 * mounted at /api/webhooks. Uses the REAL requireWebhookSignature middleware.
 */
function buildApp() {
  const app = express();
  app.use(express.json({
    verify: (req, res, buf) => { req.rawBody = buf; }
  }));
  app.use('/api/webhooks', webhookRoutes);
  return app;
}

/** Send a signed JSON POST, computing the HMAC over the exact raw bytes. */
function signedPost(app, path, bodyObj, { secret = SECRET, signature } = {}) {
  const raw = JSON.stringify(bodyObj);
  const sig = signature !== undefined
    ? signature
    : crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return request(app)
    .post(path)
    .set('Content-Type', 'application/json')
    .set('x-webhook-signature', sig)
    .send(raw);
}

describe('POST /api/webhooks/moderator', () => {
  let app;
  const originalSecret = process.env.MODERATOR_WEBHOOK_SECRET;

  beforeEach(() => {
    process.env.MODERATOR_WEBHOOK_SECRET = SECRET;
    app = buildApp();
  });

  afterAll(() => {
    if (originalSecret === undefined) {
      delete process.env.MODERATOR_WEBHOOK_SECRET;
    } else {
      process.env.MODERATOR_WEBHOOK_SECRET = originalSecret;
    }
  });

  it('fails closed with 503 when the secret is not configured', async () => {
    delete process.env.MODERATOR_WEBHOOK_SECRET;

    const res = await request(app)
      .post('/api/webhooks/moderator')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ event: 'content.approved', data: { postId: 'p1' } }));

    expect(res.status).toBe(503);
    expect(res.body.error).toBe('WEBHOOK_NOT_CONFIGURED');
    expect(Post.findByPk).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated call (no signature) with 401', async () => {
    const res = await request(app)
      .post('/api/webhooks/moderator')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ event: 'content.approved', data: { postId: 'p1' } }));

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
    expect(Post.findByPk).not.toHaveBeenCalled();
  });

  it('rejects a bad signature with 401', async () => {
    const res = await signedPost(
      app,
      '/api/webhooks/moderator',
      { event: 'content.approved', data: { postId: 'p1' } },
      { signature: 'deadbeef' }
    );

    expect(res.status).toBe(401);
    expect(res.body.error).toBe('INVALID_SIGNATURE');
    expect(Post.findByPk).not.toHaveBeenCalled();
  });

  it('merges moderation fields into existing metadata, preserving an approval hold', async () => {
    const existingMetadata = {
      approval: { status: 'pending', requestedVisibility: 'public' },
      source: 'compose'
    };
    const update = jest.fn().mockResolvedValue();
    Post.findByPk.mockResolvedValue({ id: 'p1', metadata: existingMetadata, update });

    const res = await signedPost(app, '/api/webhooks/moderator', {
      event: 'content.flagged',
      data: { postId: 'p1', reasons: ['spam'] }
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Post.findByPk).toHaveBeenCalledWith('p1');
    // The whole metadata object is preserved; only moderation fields are added.
    expect(update).toHaveBeenCalledWith({
      metadata: {
        approval: { status: 'pending', requestedVisibility: 'public' },
        source: 'compose',
        moderationStatus: 'flagged',
        moderationReasons: ['spam']
      }
    });
  });

  it('sets moderationStatus=approved on content.approved without dropping metadata', async () => {
    const existingMetadata = { approval: { status: 'pending' } };
    const update = jest.fn().mockResolvedValue();
    Post.findByPk.mockResolvedValue({ id: 'p1', metadata: existingMetadata, update });

    const res = await signedPost(app, '/api/webhooks/moderator', {
      event: 'content.approved',
      data: { postId: 'p1' }
    });

    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledWith({
      metadata: {
        approval: { status: 'pending' },
        moderationStatus: 'approved'
      }
    });
  });
});
