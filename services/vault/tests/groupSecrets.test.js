/**
 * Group secret routes — guard wiring + metadata-only contract tests.
 *
 * These tests mock the DB-backed group secret service and the shared package
 * (CA-token gate + group-membership guard) so the router can be exercised
 * without Postgres/Redis/CA. They verify:
 *   (a) the list route returns METADATA ONLY — never plaintext/secret material,
 *   (b) share is gated to admins (member is rejected with 403),
 *   (c) an admin share reaches the service.
 */

// Controls for the mocked membership guard.
let mockRole = 'member';
let mockIsMember = true;

const ROLE_RANK = { member: 1, moderator: 2, admin: 3, owner: 4 };

jest.mock('@exprsn/shared', () => ({
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next),
  AppError: class AppError extends Error {
    constructor(message, statusCode, errorCode) {
      super(message);
      this.statusCode = statusCode;
      this.errorCode = errorCode;
    }
  },
  createRateLimiter: () => (req, res, next) => next(),
  validateCAToken: () => (req, res, next) => { req.userId = 'user-1'; next(); },
  requireGroupMembership: (minRole = null) => (req, res, next) => {
    if (!mockIsMember) {
      return res.status(403).json({ error: 'NOT_GROUP_MEMBER' });
    }
    if (minRole && (ROLE_RANK[mockRole] || 0) < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: 'INSUFFICIENT_ROLE', required: minRole, actual: mockRole });
    }
    req.groupMembership = { isMember: true, role: mockRole };
    next();
  }
}));

// Avoid loading the real service (which pulls in Sequelize models).
jest.mock('../src/services/groupSecretService', () => ({
  listGroupSecrets: jest.fn(),
  shareSecret: jest.fn(),
  revokeSecret: jest.fn(),
  revealSecret: jest.fn()
}));

const express = require('express');
const request = require('supertest');
const groupSecretService = require('../src/services/groupSecretService');
const groupSecretsRouter = require('../src/routes/groupSecrets');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/groups', groupSecretsRouter);
  // minimal error handler mirroring the shared one
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    res.status(err.statusCode || 500).json({ error: err.errorCode || err.code || 'ERROR', message: err.message });
  });
  return app;
}

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

describe('Group secret routes', () => {
  beforeEach(() => {
    mockRole = 'member';
    mockIsMember = true;
    jest.clearAllMocks();
  });

  test('GET list returns metadata only — no plaintext / secret material', async () => {
    groupSecretService.listGroupSecrets.mockResolvedValue([
      {
        secretId: 'sec-1',
        path: '/group/api-key',
        key: 'api-key',
        permission: 'read',
        grantedBy: 'user-9',
        expiresAt: null,
        grantedAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        secretCreatedAt: '2025-12-01T00:00:00.000Z',
        secretUpdatedAt: '2025-12-15T00:00:00.000Z',
        secretVersion: 2
      }
    ]);

    const res = await request(buildApp())
      .get(`/api/groups/${GROUP_ID}/secrets`)
      .set('Authorization', 'Bearer x');

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/encryptedValue/i);
    expect(body).not.toMatch(/authTag/i);
    expect(body).not.toMatch(/"iv"/i);
    expect(res.body.data[0].value).toBeUndefined();
    expect(res.body.data[0].path).toBe('/group/api-key');
    expect(groupSecretService.listGroupSecrets).toHaveBeenCalledWith(GROUP_ID);
  });

  test('POST share is rejected for a non-admin member (403)', async () => {
    mockRole = 'member';
    const res = await request(buildApp())
      .post(`/api/groups/${GROUP_ID}/secrets/group/api-key/share`)
      .set('Authorization', 'Bearer x')
      .send({ permission: 'read' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INSUFFICIENT_ROLE');
    expect(groupSecretService.shareSecret).not.toHaveBeenCalled();
  });

  test('POST share succeeds for an admin and reaches the service', async () => {
    mockRole = 'admin';
    groupSecretService.shareSecret.mockResolvedValue({
      secretId: 'sec-1',
      path: '/group/api-key',
      permission: 'write',
      grantedBy: 'user-1',
      expiresAt: null
    });

    const res = await request(buildApp())
      .post(`/api/groups/${GROUP_ID}/secrets/group/api-key/share`)
      .set('Authorization', 'Bearer x')
      .send({ permission: 'write' });

    expect(res.status).toBe(201);
    expect(groupSecretService.shareSecret).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_ID, path: '/group/api-key', permission: 'write' }),
      'user-1'
    );
    // even the share response must not carry secret material
    const body = JSON.stringify(res.body);
    expect(body).not.toMatch(/encryptedValue/i);
    expect(res.body.data.value).toBeUndefined();
  });
});
