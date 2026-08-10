const cacheService = require('../services/cacheService');
const { getRedisClient } = require('../config/redis');

// Mock Redis
jest.mock('../config/redis');

describe('CacheService', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = {
      get: jest.fn(),
      setEx: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      keys: jest.fn().mockResolvedValue([])
    };

    getRedisClient.mockReturnValue(mockRedis);
    jest.clearAllMocks();
  });

  describe('get', () => {
    it('should return cached value', async () => {
      const testData = { name: 'Test', value: 123 };
      mockRedis.get.mockResolvedValue(JSON.stringify({
        data: testData,
        cachedAt: Date.now(),
        expiresAt: Date.now() + 10000
      }));

      const result = await cacheService.get('test-key');

      expect(result).toEqual(testData);
      expect(mockRedis.get).toHaveBeenCalledWith('bluesky:cache:test-key');
    });

    it('should return null for cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cacheService.get('missing-key');

      expect(result).toBeNull();
    });

    it('should return null if Redis unavailable', async () => {
      getRedisClient.mockReturnValue(null);

      const result = await cacheService.get('test-key');

      expect(result).toBeNull();
    });

    it('should delete expired cache entries', async () => {
      mockRedis.get.mockResolvedValue(JSON.stringify({
        data: { test: 'data' },
        cachedAt: Date.now() - 20000,
        expiresAt: Date.now() - 10000 // Expired
      }));

      const result = await cacheService.get('test-key');

      expect(result).toBeNull();
      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('set', () => {
    it('should cache value with TTL', async () => {
      const testData = { name: 'Test' };
      const ttl = 300;

      const result = await cacheService.set('test-key', testData, ttl);

      expect(result).toBe(true);
      expect(mockRedis.setEx).toHaveBeenCalledWith(
        'bluesky:cache:test-key',
        ttl,
        expect.stringContaining('"name":"Test"')
      );
    });

    it('should use default TTL if not specified', async () => {
      await cacheService.set('test-key', { test: true });

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        'bluesky:cache:test-key',
        300, // Default TTL
        expect.any(String)
      );
    });

    it('should return false if Redis unavailable', async () => {
      getRedisClient.mockReturnValue(null);

      const result = await cacheService.set('test-key', { test: true });

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete cached value', async () => {
      const result = await cacheService.delete('test-key');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('bluesky:cache:test-key');
    });

    it('should return false if Redis unavailable', async () => {
      getRedisClient.mockReturnValue(null);

      const result = await cacheService.delete('test-key');

      expect(result).toBe(false);
    });
  });

  describe('deletePattern', () => {
    it('should delete keys matching pattern', async () => {
      mockRedis.keys.mockResolvedValue([
        'bluesky:cache:user:1',
        'bluesky:cache:user:2'
      ]);

      const result = await cacheService.deletePattern('user:*');

      expect(result).toBe(2);
      expect(mockRedis.keys).toHaveBeenCalledWith('bluesky:cache:user:*');
      expect(mockRedis.del).toHaveBeenCalledWith([
        'bluesky:cache:user:1',
        'bluesky:cache:user:2'
      ]);
    });

    it('should return 0 if no keys match', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const result = await cacheService.deletePattern('user:*');

      expect(result).toBe(0);
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe('wrap', () => {
    it('should return cached value if available', async () => {
      const cachedData = { cached: true };
      mockRedis.get.mockResolvedValue(JSON.stringify({
        data: cachedData,
        cachedAt: Date.now(),
        expiresAt: Date.now() + 10000
      }));

      const fn = jest.fn().mockResolvedValue({ fresh: true });

      const result = await cacheService.wrap('test-key', fn);

      expect(result).toEqual(cachedData);
      expect(fn).not.toHaveBeenCalled();
    });

    it('should execute function on cache miss', async () => {
      mockRedis.get.mockResolvedValue(null);

      const freshData = { fresh: true };
      const fn = jest.fn().mockResolvedValue(freshData);

      const result = await cacheService.wrap('test-key', fn, 600);

      expect(result).toEqual(freshData);
      expect(fn).toHaveBeenCalled();
      expect(mockRedis.setEx).toHaveBeenCalled();
    });
  });

  describe('Specialized Cache Methods', () => {
    it('should cache DID document', async () => {
      const didDoc = { id: 'did:web:exprsn.io:test' };

      await cacheService.cacheDIDDocument('did:web:exprsn.io:test', didDoc, 3600);

      expect(mockRedis.setEx).toHaveBeenCalledWith(
        'bluesky:cache:did:did:web:exprsn.io:test',
        3600,
        expect.any(String)
      );
    });

    it('should cache profile', async () => {
      const profile = { displayName: 'Test User' };

      await cacheService.cacheProfile('did:web:exprsn.io:test', profile);

      expect(mockRedis.setEx).toHaveBeenCalled();
    });

    it('should invalidate user cache', async () => {
      mockRedis.keys.mockResolvedValue([
        'bluesky:cache:profile:did:web:exprsn.io:test',
        'bluesky:cache:repo:did:web:exprsn.io:test'
      ]);

      await cacheService.invalidateUserCache('did:web:exprsn.io:test');

      expect(mockRedis.del).toHaveBeenCalled();
    });
  });

  describe('getCacheStats', () => {
    it('should return cache statistics', async () => {
      mockRedis.keys.mockResolvedValue(new Array(42).fill('bluesky:cache:test'));

      const stats = await cacheService.getCacheStats();

      expect(stats.enabled).toBe(true);
      expect(stats.keys).toBe(42);
    });

    it('should handle Redis unavailable', async () => {
      getRedisClient.mockReturnValue(null);

      const stats = await cacheService.getCacheStats();

      expect(stats.enabled).toBe(false);
      expect(stats.keys).toBe(0);
    });
  });
});
