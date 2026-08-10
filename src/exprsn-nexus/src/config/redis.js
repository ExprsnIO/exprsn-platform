const Redis = require('ioredis');
const config = require('./index');
const logger = require('../utils/logger');

const redis = new Redis({
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  keyPrefix: config.redis.keyPrefix,
  retryStrategy(times) {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError(err) {
    logger.error('Redis connection error:', err);
    return true;
  }
});

redis.on('connect', () => {
  logger.info('Redis connection established successfully');
});

redis.on('error', (err) => {
  logger.error('Redis error:', err);
});

module.exports = redis;
