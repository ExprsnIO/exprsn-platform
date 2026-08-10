const moderationService = require('../../../src/services/moderationService');
const { GroupMembership, Group } = require('../../../src/models');

// Mock models
jest.mock('../../../src/models');

// Mock Redis
jest.mock('../../../src/config/redis', () => ({
  del: jest.fn().mockResolvedValue(1)
}));

// Mock axios for service calls
jest.mock('axios');

describe('ModerationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('suspendMember', () => {
    it('should suspend member with duration', async () => {
      const mockMembership = {
        id: 'membership-1',
        userId: 'user-1',
        groupId: 'group-1',
        status: 'active',
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);

      const result = await moderationService.suspendMember(
        'group-1',
        'user-1',
        'Repeated violations',
        '7d'
      );

      expect(mockMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'suspended',
          suspendedReason: 'Repeated violations'
        })
      );

      expect(result.status).toBe('suspended');
    });

    it('should calculate suspension duration correctly', async () => {
      const mockMembership = {
        id: 'membership-1',
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);

      const now = Date.now();
      await moderationService.suspendMember('group-1', 'user-1', 'Test', '24h');

      const updateCall = mockMembership.update.mock.calls[0][0];
      const expectedDuration = 24 * 60 * 60 * 1000; // 24 hours in ms
      const actualDuration = updateCall.suspendedUntil - updateCall.suspendedAt;

      // Allow 1 second tolerance for test execution time
      expect(Math.abs(actualDuration - expectedDuration)).toBeLessThan(1000);
    });

    it('should handle days duration format', async () => {
      const mockMembership = {
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);

      await moderationService.suspendMember('group-1', 'user-1', 'Test', '30d');

      const updateCall = mockMembership.update.mock.calls[0][0];
      const expectedDuration = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
      const actualDuration = updateCall.suspendedUntil - updateCall.suspendedAt;

      expect(Math.abs(actualDuration - expectedDuration)).toBeLessThan(1000);
    });

    it('should throw error if membership not found', async () => {
      GroupMembership.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        moderationService.suspendMember('group-1', 'user-1', 'Test', '7d')
      ).rejects.toThrow();
    });
  });

  describe('banMember', () => {
    it('should permanently ban member', async () => {
      const mockMembership = {
        id: 'membership-1',
        userId: 'user-1',
        groupId: 'group-1',
        status: 'active',
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);
      Group.decrement = jest.fn().mockResolvedValue(true);

      const result = await moderationService.banMember(
        'group-1',
        'user-1',
        'Serious violation'
      );

      expect(mockMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'banned',
          suspendedUntil: null, // Permanent ban
          suspendedReason: 'Serious violation'
        })
      );

      expect(Group.decrement).toHaveBeenCalledWith('memberCount', {
        where: { id: 'group-1' }
      });

      expect(result.status).toBe('banned');
    });

    it('should decrement member count', async () => {
      const mockMembership = {
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);
      Group.decrement = jest.fn().mockResolvedValue(true);

      await moderationService.banMember('group-1', 'user-1', 'Test');

      expect(Group.decrement).toHaveBeenCalledWith('memberCount', {
        where: { id: 'group-1' }
      });
    });

    it('should invalidate cache after banning', async () => {
      const mockMembership = {
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);
      Group.decrement = jest.fn().mockResolvedValue(true);

      const redis = require('../../../src/config/redis');

      await moderationService.banMember('group-1', 'user-1', 'Test');

      expect(redis.del).toHaveBeenCalledTimes(2);
      expect(redis.del).toHaveBeenCalledWith('group:group-1:member:user-1');
      expect(redis.del).toHaveBeenCalledWith('group:group-1:members');
    });

    it('should throw error if membership not found', async () => {
      GroupMembership.findOne = jest.fn().mockResolvedValue(null);

      await expect(
        moderationService.banMember('group-1', 'user-1', 'Test')
      ).rejects.toThrow();
    });
  });

  describe('Duration Parsing', () => {
    it('should parse days correctly', async () => {
      const mockMembership = {
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);

      await moderationService.suspendMember('group-1', 'user-1', 'Test', '7d');

      const updateCall = mockMembership.update.mock.calls[0][0];
      const duration = updateCall.suspendedUntil - updateCall.suspendedAt;
      const expectedDuration = 7 * 24 * 60 * 60 * 1000;

      expect(Math.abs(duration - expectedDuration)).toBeLessThan(1000);
    });

    it('should parse hours correctly', async () => {
      const mockMembership = {
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);

      await moderationService.suspendMember('group-1', 'user-1', 'Test', '48h');

      const updateCall = mockMembership.update.mock.calls[0][0];
      const duration = updateCall.suspendedUntil - updateCall.suspendedAt;
      const expectedDuration = 48 * 60 * 60 * 1000;

      expect(Math.abs(duration - expectedDuration)).toBeLessThan(1000);
    });

    it('should parse minutes correctly', async () => {
      const mockMembership = {
        update: jest.fn().mockResolvedValue(true)
      };

      GroupMembership.findOne = jest.fn().mockResolvedValue(mockMembership);

      await moderationService.suspendMember('group-1', 'user-1', 'Test', '30m');

      const updateCall = mockMembership.update.mock.calls[0][0];
      const duration = updateCall.suspendedUntil - updateCall.suspendedAt;
      const expectedDuration = 30 * 60 * 1000;

      expect(Math.abs(duration - expectedDuration)).toBeLessThan(1000);
    });
  });
});
