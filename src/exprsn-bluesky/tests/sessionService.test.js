const sessionService = require('../services/sessionService');
const { Account, Repository } = require('../models');
const { getRedisClient } = require('../config/redis');

// Mock dependencies
jest.mock('../models');
jest.mock('../config/redis');

describe('SessionService', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = {
      setEx: jest.fn().mockResolvedValue('OK'),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1)
    };

    getRedisClient.mockReturnValue(mockRedis);

    jest.clearAllMocks();
  });

  describe('createSession', () => {
    it('should create a session for valid account', async () => {
      const mockAccount = {
        did: 'did:web:exprsn.io:testuser',
        handle: 'testuser.exprsn.io',
        email: 'test@example.com',
        displayName: 'Test User',
        status: 'active'
      };

      Account.findOne.mockResolvedValue(mockAccount);

      const result = await sessionService.createSession(
        'did:web:exprsn.io:testuser',
        'user-uuid-123'
      );

      expect(result).toHaveProperty('accessJwt');
      expect(result).toHaveProperty('refreshJwt');
      expect(result.handle).toBe('testuser.exprsn.io');
      expect(result.did).toBe('did:web:exprsn.io:testuser');
      expect(mockRedis.setEx).toHaveBeenCalled();
    });

    it('should throw error for inactive account', async () => {
      Account.findOne.mockResolvedValue({
        status: 'inactive'
      });

      await expect(
        sessionService.createSession('did:web:exprsn.io:testuser', 'user-uuid-123')
      ).rejects.toThrow('Account not found or inactive');
    });

    it('should throw error for non-existent account', async () => {
      Account.findOne.mockResolvedValue(null);

      await expect(
        sessionService.createSession('did:web:exprsn.io:testuser', 'user-uuid-123')
      ).rejects.toThrow('Account not found or inactive');
    });
  });

  describe('refreshSession', () => {
    it('should refresh session with valid refresh token', async () => {
      const mockSession = {
        did: 'did:web:exprsn.io:testuser',
        handle: 'testuser.exprsn.io',
        refreshToken: 'valid-refresh-token',
        exprsnUserId: 'user-uuid-123'
      };

      // Mock token generation
      const refreshToken = sessionService.generateRefreshToken({
        did: 'did:web:exprsn.io:testuser',
        sessionId: 'session-123',
        exprsnUserId: 'user-uuid-123'
      });

      mockRedis.get.mockResolvedValue(JSON.stringify({
        ...mockSession,
        refreshToken
      }));

      const result = await sessionService.refreshSession(refreshToken);

      expect(result).toHaveProperty('accessJwt');
      expect(result).toHaveProperty('refreshJwt');
      expect(result.did).toBe('did:web:exprsn.io:testuser');
    });

    it('should throw error for invalid refresh token', async () => {
      await expect(
        sessionService.refreshSession('invalid-token')
      ).rejects.toThrow();
    });

    it('should throw error for expired session', async () => {
      mockRedis.get.mockResolvedValue(null);

      const refreshToken = sessionService.generateRefreshToken({
        did: 'did:web:exprsn.io:testuser',
        sessionId: 'session-123',
        exprsnUserId: 'user-uuid-123'
      });

      await expect(
        sessionService.refreshSession(refreshToken)
      ).rejects.toThrow('Session not found or expired');
    });
  });

  describe('validateToken', () => {
    it('should validate correct access token', async () => {
      const accessToken = sessionService.generateAccessToken({
        did: 'did:web:exprsn.io:testuser',
        sessionId: 'session-123',
        handle: 'testuser.exprsn.io',
        exprsnUserId: 'user-uuid-123'
      });

      mockRedis.get.mockResolvedValue(JSON.stringify({
        did: 'did:web:exprsn.io:testuser'
      }));

      const result = await sessionService.validateToken(accessToken);

      expect(result).not.toBeNull();
      expect(result.did).toBe('did:web:exprsn.io:testuser');
    });

    it('should return null for invalid token', async () => {
      const result = await sessionService.validateToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should return null for non-existent session', async () => {
      const accessToken = sessionService.generateAccessToken({
        did: 'did:web:exprsn.io:testuser',
        sessionId: 'session-123',
        handle: 'testuser.exprsn.io',
        exprsnUserId: 'user-uuid-123'
      });

      mockRedis.get.mockResolvedValue(null);

      const result = await sessionService.validateToken(accessToken);

      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('should delete session successfully', async () => {
      const accessToken = sessionService.generateAccessToken({
        did: 'did:web:exprsn.io:testuser',
        sessionId: 'session-123',
        handle: 'testuser.exprsn.io',
        exprsnUserId: 'user-uuid-123'
      });

      mockRedis.get.mockResolvedValue(JSON.stringify({
        did: 'did:web:exprsn.io:testuser'
      }));

      const result = await sessionService.deleteSession(accessToken);

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it('should throw error for invalid token', async () => {
      await expect(
        sessionService.deleteSession('invalid-token')
      ).rejects.toThrow();
    });
  });
});
