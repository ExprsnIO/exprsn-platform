const membershipService = require('../../../src/services/membershipService');
const { GroupMembership, Group } = require('../../../src/models');

// Mock the models
jest.mock('../../../src/models');

// Mock Redis
jest.mock('../../../src/config/redis', () => ({
  del: jest.fn().mockResolvedValue(1),
  get: jest.fn().mockResolvedValue(null),
  setex: jest.fn().mockResolvedValue('OK')
}));

describe('MembershipService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getUserMemberships', () => {
    it('should return user memberships with group details', async () => {
      const mockMemberships = {
        count: 2,
        rows: [
          {
            id: 'membership-1',
            userId: 'user-1',
            groupId: 'group-1',
            role: 'owner',
            status: 'active',
            joinedAt: Date.now(),
            group: {
              id: 'group-1',
              name: 'Tech Group',
              slug: 'tech-group',
              memberCount: 100
            }
          },
          {
            id: 'membership-2',
            userId: 'user-1',
            groupId: 'group-2',
            role: 'member',
            status: 'active',
            joinedAt: Date.now(),
            group: {
              id: 'group-2',
              name: 'Dev Group',
              slug: 'dev-group',
              memberCount: 50
            }
          }
        ]
      };

      GroupMembership.findAndCountAll = jest.fn().mockResolvedValue(mockMemberships);

      const result = await membershipService.getUserMemberships('user-1', {}, { page: 1, limit: 50 });

      expect(result.memberships).toHaveLength(2);
      expect(result.memberships[0].group.name).toBe('Tech Group');
      expect(result.pagination.total).toBe(2);
      expect(result.pagination.pages).toBe(1);
    });

    it('should filter by status', async () => {
      GroupMembership.findAndCountAll = jest.fn().mockResolvedValue({
        count: 1,
        rows: []
      });

      await membershipService.getUserMemberships('user-1', { status: 'active' }, {});

      expect(GroupMembership.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            status: 'active'
          })
        })
      );
    });

    it('should filter by role', async () => {
      GroupMembership.findAndCountAll = jest.fn().mockResolvedValue({
        count: 0,
        rows: []
      });

      await membershipService.getUserMemberships('user-1', { role: 'admin' }, {});

      expect(GroupMembership.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: 'user-1',
            role: 'admin'
          })
        })
      );
    });

    it('should handle pagination correctly', async () => {
      GroupMembership.findAndCountAll = jest.fn().mockResolvedValue({
        count: 100,
        rows: []
      });

      const result = await membershipService.getUserMemberships(
        'user-1',
        {},
        { page: 2, limit: 25 }
      );

      expect(GroupMembership.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 25,
          offset: 25
        })
      );

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(25);
      expect(result.pagination.pages).toBe(4);
    });
  });

  describe('listMembers', () => {
    it('should return group members', async () => {
      const mockMembers = {
        count: 3,
        rows: [
          { id: 'mem-1', userId: 'user-1', role: 'owner', status: 'active' },
          { id: 'mem-2', userId: 'user-2', role: 'admin', status: 'active' },
          { id: 'mem-3', userId: 'user-3', role: 'member', status: 'active' }
        ]
      };

      GroupMembership.findAndCountAll = jest.fn().mockResolvedValue(mockMembers);

      const result = await membershipService.listMembers('group-1', {}, {});

      expect(result.members).toHaveLength(3);
      expect(result.pagination.total).toBe(3);
    });

    it('should filter by role', async () => {
      GroupMembership.findAndCountAll = jest.fn().mockResolvedValue({
        count: 1,
        rows: []
      });

      await membershipService.listMembers('group-1', { role: 'admin' }, {});

      expect(GroupMembership.findAndCountAll).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            groupId: 'group-1',
            role: 'admin',
            status: 'active'
          })
        })
      );
    });
  });

  describe('leaveGroup', () => {
    it('should allow members to leave group', async () => {
      const mockMembership = {
        userId: 'user-1',
        groupId: 'group-1',
        role: 'member',
        status: 'active',
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);
      Group.decrement = jest.fn().mockResolvedValue(true);

      const redis = require('../../../src/config/redis');

      await membershipService.leaveGroup('user-1', 'group-1');

      expect(mockMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'left'
        })
      );
      expect(Group.decrement).toHaveBeenCalledWith('memberCount', { where: { id: 'group-1' } });
      expect(redis.del).toHaveBeenCalled();
    });

    it('should not allow owners to leave', async () => {
      const mockMembership = {
        userId: 'user-1',
        groupId: 'group-1',
        role: 'owner',
        status: 'active'
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);

      await expect(membershipService.leaveGroup('user-1', 'group-1')).rejects.toThrow();
    });

    it('should throw error if not a member', async () => {
      GroupMembership.findOne = jest.fn().mockResolvedValue(null);

      await expect(membershipService.leaveGroup('user-1', 'group-1')).rejects.toThrow();
    });
  });

  describe('removeMember', () => {
    it('should allow admins to remove members', async () => {
      const adminMembership = {
        userId: 'admin-1',
        groupId: 'group-1',
        role: 'admin',
        status: 'active'
      };

      const targetMembership = {
        userId: 'user-1',
        groupId: 'group-1',
        role: 'member',
        status: 'active',
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn()
        .mockResolvedValueOnce(adminMembership)
        .mockResolvedValueOnce(targetMembership);

      Group.decrement = jest.fn().mockResolvedValue(true);

      await membershipService.removeMember('admin-1', 'group-1', 'user-1', 'Violation');

      expect(targetMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'left',
          suspendedReason: 'Violation'
        })
      );
      expect(Group.decrement).toHaveBeenCalled();
    });

    it('should not allow removing owners', async () => {
      const adminMembership = {
        userId: 'admin-1',
        groupId: 'group-1',
        role: 'admin',
        status: 'active'
      };

      const targetMembership = {
        userId: 'user-1',
        groupId: 'group-1',
        role: 'owner',
        status: 'active'
      };

      GroupMembership.findOne = jest.fn()
        .mockResolvedValueOnce(adminMembership)
        .mockResolvedValueOnce(targetMembership);

      await expect(
        membershipService.removeMember('admin-1', 'group-1', 'user-1')
      ).rejects.toThrow();
    });

    it('should not allow non-admins to remove members', async () => {
      const regularMembership = {
        userId: 'user-2',
        groupId: 'group-1',
        role: 'member',
        status: 'active'
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(regularMembership);

      await expect(
        membershipService.removeMember('user-2', 'group-1', 'user-1')
      ).rejects.toThrow();
    });
  });
});
