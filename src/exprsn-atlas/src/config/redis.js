const Redis = require('ioredis');
const config = require('./index');

/**
 * ═══════════════════════════════════════════════════════════
 * Redis Configuration
 * ═══════════════════════════════════════════════════════════
 */

let redis;

if (config.redis.enabled) {
  redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    password: config.redis.password,
    db: config.redis.db,
    keyPrefix: config.redis.keyPrefix,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
    maxRetriesPerRequest: 3
  });

  redis.on('connect', () => {
    console.log('Redis connected');
  });

  redis.on('error', (err) => {
    console.error('Redis error:', err);
  });
} else {
  // Mock Redis client when disabled
  redis = {
    get: async () => null,
    set: async () => 'OK',
    setex: async () => 'OK',
    del: async () => 1,
    exists: async () => 0,
    expire: async () => 1,
    incr: async () => 1,
    decr: async () => 1,
    hget: async () => null,
    hset: async () => 1,
    hgetall: async () => ({}),
    hmset: async () => 'OK',
    lpush: async () => 1,
    rpush: async () => 1,
    lrange: async () => [],
    sadd: async () => 1,
    smembers: async () => [],
    zadd: async () => 1,
    zrange: async () => [],
    zrevrange: async () => [],
    zincrby: async () => '1',
    ping: async () => 'PONG',
    quit: async () => 'OK'
  };
}

module.exports = redis;
