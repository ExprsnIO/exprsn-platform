const request = require('supertest');
const express = require('express');
const groupsRouter = require('../../../src/routes/groups');

// Mock middleware
jest.mock('../../../src/middleware/tokenAuth', () => ({
  requireToken: () => (req, res, next) => {
    req.user = { id: 'test-user-123' };
    req.token = { data: { userId: 'test-user-123' } };
    next();
  },
  requirePermissions: () => (req, res, next) => next()
}));

jest.mock('../../../src/middleware/groupAuth', () => ({
  validateGroup: (req, res, next) => next(),
  requireGroupMember: (req, res, next) => next(),
  requireGroupAdmin: (req, res, next) => next()
}));

// Mock services
jest.mock('../../../src/services/groupService');
jest.mock('../../../src/services/membershipService');
jest.mock('../../../src/services/groupDiscoveryService');

const groupService = require('../../../src/services/groupService');
const membershipService = require('../../../src/services/membershipService');

describe('Groups Routes', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/groups', groupsRouter);

    // Error handler
    app.use((err, req, res, next) => {
      res.status(err.status || 500).json({
        success: false,
        error: err.message
      });
    });
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/groups', () => {
    it('should create a group with valid input', async () => {
      const mockGroup = {
        id: 'group-123',
        name: 'Tech Enthusiasts',
        slug: 'tech-enthusiasts',
        description: 'A community for technology lovers',
        visibility: 'public',
        memberCount: 1
      };

      groupService.createGroup = jest.fn().mockResolvedValue(mockGroup);

      const response = await request(app)
        .post('/api/groups')
        .send({
          name: 'Tech Enthusiasts',
          description: 'A community for technology lovers',
          visibility: 'public',
          joinMode: 'open',
          governanceModel: 'centralized'
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.group.name).toBe('Tech Enthusiasts');
      expect(groupService.createGroup).toHaveBeenCalled();
    });

    it('should sanitize HTML in group description', async () => {
      const mockGroup = {
        id: 'group-123',
        name: 'Test Group',
        description: 'Safe content'
      };

      groupService.createGroup = jest.fn().mockResolvedValue(mockGroup);

      await request(app)
        .post('/api/groups')
        .send({
          name: 'Test Group',
          description: '<script>alert("xss")</script>Safe content',
          visibility: 'public'
        })
        .expect(201);

      // Check that createGroup was called with sanitized data
      const sanitizedData = groupService.createGroup.mock.calls[0][1];
      expect(sanitizedData.description).not.toContain('script');
      expect(sanitizedData.description).not.toContain('alert');
    });

    it('should reject invalid visibility', async () => {
      const response = await request(app)
        .post('/api/groups')
        .send({
          name: 'Test Group',
          visibility: 'invalid-visibility'
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should reject missing required fields', async () => {
      const response = await request(app)
        .post('/api/groups')
        .send({
          description: 'Missing name'
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });

    it('should handle long names', async () => {
      const longName = 'a'.repeat(300);

      const response = await request(app)
        .post('/api/groups')
        .send({
          name: longName
        })
        .expect(400);

      expect(response.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/groups/:id', () => {
    it('should update group with valid input', async () => {
      const mockGroup = {
        id: 'group-123',
        name: 'Updated Group',
        description: 'Updated description'
      };

      groupService.updateGroup = jest.fn().mockResolvedValue(mockGroup);

      const response = await request(app)
        .put('/api/groups/group-123')
        .send({
          description: 'Updated description',
          tags: ['tech', 'community']
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.group.description).toBe('Updated description');
    });

    it('should sanitize HTML in updated description', async () => {
      const mockGroup = {
        id: 'group-123',
        description: 'Safe content'
      };

      groupService.updateGroup = jest.fn().mockResolvedValue(mockGroup);

      await request(app)
        .put('/api/groups/group-123')
        .send({
          description: '<b>Bold text</b><script>alert("xss")</script>'
        })
        .expect(200);

      const sanitizedData = groupService.updateGroup.mock.calls[0][2];
      expect(sanitizedData.description).toContain('<b>Bold text</b>');
      expect(sanitizedData.description).not.toContain('script');
    });

    it('should handle service errors', async () => {
      groupService.updateGroup = jest.fn().mockRejectedValue(new Error('GROUP_NOT_FOUND'));

      const response = await request(app)
        .put('/api/groups/invalid-id')
        .send({
          description: 'New description'
        })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('DELETE /api/groups/:id', () => {
    it('should delete group', async () => {
      groupService.deleteGroup = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .delete('/api/groups/group-123')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(groupService.deleteGroup).toHaveBeenCalledWith('group-123', 'test-user-123');
    });
  });

  describe('POST /api/groups/:id/join', () => {
    it('should join group with valid input', async () => {
      const mockResult = {
        status: 'joined',
        membership: {
          id: 'membership-123',
          userId: 'test-user-123',
          groupId: 'group-123',
          role: 'member'
        }
      };

      membershipService.joinGroup = jest.fn().mockResolvedValue(mockResult);

      const response = await request(app)
        .post('/api/groups/group-123/join')
        .send({
          message: 'I would like to join'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.status).toBe('joined');
    });

    it('should handle join with invite code', async () => {
      const mockResult = {
        status: 'joined',
        membership: { id: 'membership-123' }
      };

      membershipService.joinGroup = jest.fn().mockResolvedValue(mockResult);

      await request(app)
        .post('/api/groups/group-123/join')
        .send({
          inviteCode: 'abc123'
        })
        .expect(200);

      expect(membershipService.joinGroup).toHaveBeenCalledWith(
        'test-user-123',
        'group-123',
        expect.objectContaining({
          inviteCode: 'abc123'
        })
      );
    });
  });

  describe('POST /api/groups/:id/leave', () => {
    it('should leave group', async () => {
      membershipService.leaveGroup = jest.fn().mockResolvedValue(true);

      const response = await request(app)
        .post('/api/groups/group-123/leave')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(membershipService.leaveGroup).toHaveBeenCalledWith('test-user-123', 'group-123');
    });

    it('should handle owner cannot leave error', async () => {
      membershipService.leaveGroup = jest.fn().mockRejectedValue(new Error('OWNER_CANNOT_LEAVE'));

      const response = await request(app)
        .post('/api/groups/group-123/leave')
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('Input Sanitization', () => {
    it('should remove XSS attempts from group name', async () => {
      const mockGroup = {
        id: 'group-123',
        name: 'Test Group'
      };

      groupService.createGroup = jest.fn().mockResolvedValue(mockGroup);

      await request(app)
        .post('/api/groups')
        .send({
          name: '<img src=x onerror="alert(1)">Test Group',
          visibility: 'public'
        })
        .expect(201);

      const sanitizedData = groupService.createGroup.mock.calls[0][1];
      expect(sanitizedData.name).not.toContain('onerror');
      expect(sanitizedData.name).not.toContain('<img');
    });

    it('should allow safe HTML in descriptions', async () => {
      const mockGroup = {
        id: 'group-123',
        description: '<b>Bold</b> text'
      };

      groupService.createGroup = jest.fn().mockResolvedValue(mockGroup);

      await request(app)
        .post('/api/groups')
        .send({
          name: 'Test Group',
          description: '<b>Bold</b> text with <i>italic</i>',
          visibility: 'public'
        })
        .expect(201);

      const sanitizedData = groupService.createGroup.mock.calls[0][1];
      expect(sanitizedData.description).toContain('<b>Bold</b>');
      expect(sanitizedData.description).toContain('<i>italic</i>');
    });
  });
});
