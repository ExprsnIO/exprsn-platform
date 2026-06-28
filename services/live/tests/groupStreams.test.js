/**
 * Phase 5 — group-hosted live streams.
 *
 * Covers the HTTP contract for POST /api/groups/:groupId/streams:
 *  - a group admin can create a stream owned by the group (group_id stamped,
 *    user_id records the host);
 *  - a non-admin member is rejected by the requireGroupMembership('admin') guard.
 *
 * The shared membership guard and the heavy stream service (Cloudflare/SRS,
 * Sequelize models) are mocked so this stays a fast unit-level route test.
 */

const express = require('express');
const request = require('supertest');

// Controllable membership guard standing in for @exprsn/shared.
// Prefixed `mock` so jest.mock's factory may reference it.
const mockMembership = { allowAdmin: true };
jest.mock('@exprsn/shared', () => ({
  requireGroupMembership: (minRole = null) => (req, res, next) => {
    if (minRole === 'admin' && !mockMembership.allowAdmin) {
      return res.status(403).json({ error: 'INSUFFICIENT_ROLE', required: 'admin' });
    }
    req.groupMembership = { isMember: true, role: mockMembership.allowAdmin ? 'admin' : 'member' };
    next();
  }
}));

// requireAuth stamps a fixed host identity.
jest.mock('../src/middleware/auth', () => ({
  requireAuth: (req, res, next) => { req.user = { id: 'host-1' }; next(); },
  optionalAuth: (req, res, next) => next()
}));

// Stream service echoes what it was given so we can assert group_id/user_id.
jest.mock('../src/services/stream', () => ({
  createStream: jest.fn(async (data, userId) => ({
    id: 'stream-1',
    user_id: userId,
    group_id: data.groupId,
    title: data.title,
    status: 'pending'
  })),
  listStreams: jest.fn(async (filters) => ({ streams: [], pagination: { total: 0, ...filters } }))
}));

const { createStream, listStreams } = require('../src/services/stream');
const groupStreamRoutes = require('../src/routes/groupStreams');

const GROUP_ID = '11111111-1111-1111-1111-111111111111';

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/groups', groupStreamRoutes);
  return app;
}

describe('group stream routes (Phase 5)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockMembership.allowAdmin = true;
  });

  it('lets a group admin create a group-owned stream', async () => {
    const res = await request(buildApp())
      .post(`/api/groups/${GROUP_ID}/streams`)
      .send({ title: 'Town hall' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.stream.group_id).toBe(GROUP_ID);
    expect(res.body.stream.user_id).toBe('host-1');
    expect(createStream).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Town hall', groupId: GROUP_ID }),
      'host-1'
    );
  });

  it('rejects a non-admin member with 403 and does not create', async () => {
    mockMembership.allowAdmin = false;

    const res = await request(buildApp())
      .post(`/api/groups/${GROUP_ID}/streams`)
      .send({ title: 'Town hall' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('INSUFFICIENT_ROLE');
    expect(createStream).not.toHaveBeenCalled();
  });

  it('lists a group\'s streams for a member, scoped by groupId', async () => {
    const res = await request(buildApp())
      .get(`/api/groups/${GROUP_ID}/streams`);

    expect(res.status).toBe(200);
    expect(listStreams).toHaveBeenCalledWith(
      expect.objectContaining({ groupId: GROUP_ID })
    );
  });
});
