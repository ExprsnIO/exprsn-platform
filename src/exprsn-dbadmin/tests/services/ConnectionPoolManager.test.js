const connectionPoolManager = require('../../src/services/ConnectionPoolManager');
const { encrypt } = require('../../src/utils/encryption');

describe('ConnectionPoolManager', () => {
  const testConfig = {
    host: 'localhost',
    port: 5432,
    database: 'postgres',
    username: 'postgres',
    password: encrypt('test-password'), // Use encrypted password
    sslEnabled: false
  };

  afterAll(async () => {
    await connectionPoolManager.closeAllPools();
  });

  describe('getPool', () => {
    it('should create a new pool for a connection', () => {
      const pool = connectionPoolManager.getPool(testConfig);
      expect(pool).toBeDefined();
      expect(pool.totalCount).toBeDefined();
    });

    it('should reuse existing pool for same connection', () => {
      const pool1 = connectionPoolManager.getPool(testConfig);
      const pool2 = connectionPoolManager.getPool(testConfig);
      expect(pool1).toBe(pool2);
    });
  });

  describe('generatePoolKey', () => {
    it('should generate unique key for connection', () => {
      const key = connectionPoolManager.generatePoolKey(testConfig);
      expect(key).toBe('localhost:5432:postgres:postgres');
    });
  });

  describe('getPoolStats', () => {
    it('should return statistics for all pools', () => {
      connectionPoolManager.getPool(testConfig);
      const stats = connectionPoolManager.getPoolStats();
      expect(stats).toBeInstanceOf(Array);
      expect(stats.length).toBeGreaterThan(0);
      expect(stats[0]).toHaveProperty('poolKey');
      expect(stats[0]).toHaveProperty('totalCount');
    });
  });
});
