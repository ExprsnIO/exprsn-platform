/**
 * Group file routes — guard wiring tests.
 *
 * These tests mock the DB-backed services, the storage layer, and the shared
 * group-membership guard so the router can be exercised without Postgres/Redis.
 * They verify (a) the membership guard runs before the handler and rejects
 * non-members, and (b) a member request reaches the service and returns data.
 */

// Control whether the mocked guard admits the request.
let mockAllowMembership = true;

jest.mock('@exprsn/shared', () => ({
  requireGroupMembership: () => (req, res, next) => {
    if (!mockAllowMembership) {
      return res.status(403).json({ error: 'NOT_GROUP_MEMBER' });
    }
    req.groupMembership = { isMember: true, role: 'member' };
    next();
  }
}));

// Avoid loading the real models/storage (which create a Sequelize instance).
jest.mock('../src/services/fileService', () => ({
  listGroupFiles: jest.fn(),
  uploadGroupFile: jest.fn()
}));
jest.mock('../src/services/directoryService', () => ({
  listGroupDirectoryContents: jest.fn()
}));

// Lightweight middleware doubles.
jest.mock('../src/middleware', () => ({
  authenticate: (req, res, next) => { req.userId = 'user-1'; next(); },
  requirePermissions: () => (req, res, next) => next(),
  uploadSingle: (req, res, next) => next(),
  handleUploadError: (req, res, next) => next(),
  validateFile: (req, res, next) => next(),
  validateUUID: () => (req, res, next) => next(),
  asyncHandler: (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
}));

const express = require('express');
const request = require('supertest');
const fileService = require('../src/services/fileService');
const groupsRouter = require('../src/routes/groups');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/groups', groupsRouter);
  return app;
}

const GROUP_ID = '11111111-1111-4111-8111-111111111111';

describe('Group file routes', () => {
  beforeEach(() => {
    mockAllowMembership = true;
    jest.clearAllMocks();
  });

  test('rejects a non-member with 403 and never calls the service', async () => {
    mockAllowMembership = false;
    const app = buildApp();

    const res = await request(app).get(`/api/groups/${GROUP_ID}/files`);

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('NOT_GROUP_MEMBER');
    expect(fileService.listGroupFiles).not.toHaveBeenCalled();
  });

  test('member listing reaches the service scoped by group', async () => {
    fileService.listGroupFiles.mockResolvedValue([{ id: 'f1', name: 'a.png' }]);
    const app = buildApp();

    const res = await request(app).get(`/api/groups/${GROUP_ID}/files?images=true`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
    expect(fileService.listGroupFiles).toHaveBeenCalledWith(
      GROUP_ID,
      null,
      expect.objectContaining({ imagesOnly: true })
    );
  });
});
