const groupService = require('../../../src/services/groupService');
const { Group, GroupMembership } = require('../../../src/models');
const { Op } = require('sequelize');

// Mock models (groupService imports them from the index)
jest.mock('../../../src/models');

// Mock roleService — createGroup calls createDefaultRoles, which otherwise
// reaches a real Postgres connection via the per-file model imports.
jest.mock('../../../src/services/roleService', () => ({
  createDefaultRoles: jest.fn().mockResolvedValue([])
}));

// Mock Redis
jest.mock('../../../src/config/redis', () => ({
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK')
}));

describe('GroupService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createGroup', () => {
    it('should create group with valid data', async () => {
      const mockGroup = {
        id: 'group-123',
        name: 'Tech Enthusiasts',
        slug: 'tech-enthusiasts',
        description: 'A community for technology lovers',
        visibility: 'public',
        creatorId: 'user-123',
        memberCount: 1
      };

      const mockMembership = {
        id: 'membership-123',
        userId: 'user-123',
        groupId: 'group-123',
        role: 'owner',
        status: 'active'
      };

      Group.findOne = jest.fn().mockResolvedValue(null);
      Group.create = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.create = jest.fn().mockResolvedValue(mockMembership);

      const result = await groupService.createGroup('user-123', {
        name: 'Tech Enthusiasts',
        description: 'A community for technology lovers',
        visibility: 'public'
      });

      expect(Group.create).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Tech Enthusiasts',
          slug: expect.any(String),
          creatorId: 'user-123',
          memberCount: 1
        })
      );

      expect(GroupMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-123',
          groupId: mockGroup.id,
          role: 'owner',
          status: 'active',
          signature: expect.any(String),
          joinedAt: expect.any(Number)
        })
      );

      expect(result.name).toBe('Tech Enthusiasts');
    });

    it('should generate unique slug from name', async () => {
      const mockGroup = {
        id: 'group-123',
        slug: 'tech-enthusiasts'
      };

      Group.findOne = jest.fn().mockResolvedValue(null);
      Group.create = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.create = jest.fn().mockResolvedValue({});

      await groupService.createGroup('user-123', {
        name: 'Tech Enthusiasts!!!',
        visibility: 'public'
      });

      const createCall = Group.create.mock.calls[0][0];
      expect(createCall.slug).toMatch(/^tech-enthusiasts/);
    });

    it('should set default governance model', async () => {
      const mockGroup = {
        id: 'group-123',
        governanceModel: 'centralized'
      };

      Group.findOne = jest.fn().mockResolvedValue(null);
      Group.create = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.create = jest.fn().mockResolvedValue({});

      await groupService.createGroup('user-123', {
        name: 'Test Group',
        visibility: 'public'
      });

      const createCall = Group.create.mock.calls[0][0];
      expect(createCall.governanceModel).toBe('centralized');
    });

    it('should handle custom governance rules', async () => {
      const mockGroup = {
        id: 'group-123',
        governanceModel: 'dao',
        governanceRules: {
          votingPeriod: 7,
          quorum: 0.5,
          passingThreshold: 0.6
        }
      };

      Group.findOne = jest.fn().mockResolvedValue(null);
      Group.create = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.create = jest.fn().mockResolvedValue({});

      await groupService.createGroup('user-123', {
        name: 'DAO Group',
        visibility: 'public',
        governanceModel: 'dao',
        governanceRules: {
          votingPeriod: 7,
          quorum: 0.5,
          passingThreshold: 0.6
        }
      });

      const createCall = Group.create.mock.calls[0][0];
      expect(createCall.governanceRules.quorum).toBe(0.5);
    });
  });

  describe('updateGroup', () => {
    it('should update group with valid data', async () => {
      const mockGroup = {
        id: 'group-123',
        creatorId: 'user-123',
        update: jest.fn().mockResolvedValue(true)
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.findOne = jest.fn().mockResolvedValue({ role: 'owner' });

      const redis = require('../../../src/config/redis');

      await groupService.updateGroup('group-123', 'user-123', {
        description: 'Updated description',
        tags: ['tech', 'community']
      });

      expect(mockGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          description: 'Updated description',
          tags: ['tech', 'community']
        })
      );

      expect(redis.del).toHaveBeenCalledWith('group:group-123:full');
      expect(redis.del).toHaveBeenCalledWith('group:group-123:info');
    });

    it('should throw error if user is not owner', async () => {
      const mockGroup = {
        id: 'group-123',
        creatorId: 'user-123'
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);
      // A non-member has no active membership.
      GroupMembership.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        groupService.updateGroup('group-123', 'user-456', {
          description: 'Updated'
        })
      ).rejects.toThrow('INSUFFICIENT_PERMISSIONS');
    });

    it('should not allow changing creator via update', async () => {
      const mockGroup = {
        id: 'group-123',
        creatorId: 'user-123',
        update: jest.fn().mockResolvedValue(true)
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.findOne = jest.fn().mockResolvedValue({ role: 'owner' });

      await groupService.updateGroup('group-123', 'user-123', {
        creatorId: 'user-456', // Attempt to change creator
        description: 'Updated'
      });

      const updateCall = mockGroup.update.mock.calls[0][0];
      expect(updateCall.creatorId).toBeUndefined();
    });

    it('should invalidate cache after update', async () => {
      const mockGroup = {
        id: 'group-123',
        creatorId: 'user-123',
        update: jest.fn().mockResolvedValue(true)
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.findOne = jest.fn().mockResolvedValue({ role: 'owner' });

      const redis = require('../../../src/config/redis');

      await groupService.updateGroup('group-123', 'user-123', {
        description: 'Updated'
      });

      expect(redis.del).toHaveBeenCalledWith('group:group-123:full');
      expect(redis.del).toHaveBeenCalledWith('group:group-123:info');
    });

    it('should allow a platform admin to update without group membership', async () => {
      const mockGroup = {
        id: 'group-123',
        creatorId: 'user-123',
        update: jest.fn().mockResolvedValue(true)
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.findOne = jest.fn().mockResolvedValue(null);

      await groupService.updateGroup(
        'group-123',
        'admin-1',
        { description: 'Admin edit' },
        { isPlatformAdmin: true }
      );

      // Membership lookup is bypassed entirely for platform admins.
      expect(GroupMembership.findOne).not.toHaveBeenCalled();
      expect(mockGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({ description: 'Admin edit' })
      );
    });
  });

  describe('deleteGroup', () => {
    it('should soft delete the group', async () => {
      const mockGroup = {
        id: 'group-123',
        creatorId: 'user-123',
        update: jest.fn().mockResolvedValue(true)
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.findOne = jest.fn().mockResolvedValue({ role: 'owner' });

      await groupService.deleteGroup('group-123', 'user-123');

      expect(mockGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({
          isActive: false,
          deletedAt: expect.any(Number)
        })
      );
    });

    it('should throw error if user is not owner', async () => {
      const mockGroup = {
        id: 'group-123',
        creatorId: 'user-123'
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        groupService.deleteGroup('group-123', 'user-456')
      ).rejects.toThrow('ONLY_OWNER_CAN_DELETE');
    });

    it('should invalidate cache after deletion', async () => {
      const mockGroup = {
        id: 'group-123',
        creatorId: 'user-123',
        update: jest.fn().mockResolvedValue(true)
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.findOne = jest.fn().mockResolvedValue({ role: 'owner' });

      const redis = require('../../../src/config/redis');

      await groupService.deleteGroup('group-123', 'user-123');

      expect(redis.del).toHaveBeenCalledWith('group:group-123:full');
      expect(redis.del).toHaveBeenCalledWith('group:group-123:info');
    });

    it('should allow a platform admin to delete without being owner', async () => {
      const mockGroup = {
        id: 'group-123',
        creatorId: 'user-123',
        update: jest.fn().mockResolvedValue(true)
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);
      GroupMembership.findOne = jest.fn().mockResolvedValue(null);

      await groupService.deleteGroup('group-123', 'admin-1', {
        isPlatformAdmin: true
      });

      expect(GroupMembership.findOne).not.toHaveBeenCalled();
      expect(mockGroup.update).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false })
      );
    });
  });

  describe('getGroup', () => {
    it('should return group by id', async () => {
      const mockGroup = {
        id: 'group-123',
        name: 'Tech Group',
        visibility: 'public'
      };

      Group.findByPk = jest.fn().mockResolvedValue(mockGroup);

      const result = await groupService.getGroup('group-123');

      expect(result.name).toBe('Tech Group');
      expect(Group.findByPk).toHaveBeenCalledWith('group-123');
    });

    it('should throw error if group not found', async () => {
      Group.findByPk = jest.fn().mockResolvedValue(null);

      await expect(
        groupService.getGroup('invalid-id')
      ).rejects.toThrow();
    });
  });

  describe('listGroups', () => {
    it('should return paginated groups', async () => {
      const mockGroups = {
        count: 100,
        rows: [
          { id: 'group-1', name: 'Group 1' },
          { id: 'group-2', name: 'Group 2' }
        ]
      };

      Group.findAndCountAll = jest.fn().mockResolvedValue(mockGroups);

      const result = await groupService.listGroups(
        {},
        { page: 1, limit: 50 }
      );

      expect(result.groups).toHaveLength(2);
      expect(result.pagination.total).toBe(100);
      expect(result.pagination.pages).toBe(2);
    });

    it('should filter by visibility', async () => {
      Group.findAndCountAll = jest.fn().mockResolvedValue({
        count: 10,
        rows: []
      });

      await groupService.listGroups(
        { visibility: 'public' },
        { page: 1, limit: 50 }
      );

      expect(Group.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            visibility: 'public'
          })
        })
      );
    });

    it('should filter by category', async () => {
      Group.findAndCountAll = jest.fn().mockResolvedValue({
        count: 5,
        rows: []
      });

      await groupService.listGroups(
        { category: 'technology' },
        { page: 1, limit: 50 }
      );

      expect(Group.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            category: 'technology'
          })
        })
      );
    });

    it('should search by name', async () => {
      Group.findAndCountAll = jest.fn().mockResolvedValue({
        count: 3,
        rows: []
      });

      await groupService.listGroups(
        { search: 'tech' },
        { page: 1, limit: 50 }
      );

      const whereClause = Group.findAndCountAll.mock.calls[0][0].where;
      // search builds an Op.or over name/description iLike clauses.
      expect(whereClause[Op.or]).toBeDefined();
      expect(whereClause[Op.or]).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: expect.objectContaining({ [Op.iLike]: '%tech%' })
          })
        ])
      );
    });
  });
});
