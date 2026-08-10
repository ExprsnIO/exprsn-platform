const redis = require('redis');
const { logger } = require('@exprsn/shared');
require('dotenv').config();

let redisClient = null;
let redisPub = null;
let redisSub = null;

async function initializeRedis() {
  if (process.env.REDIS_ENABLED === 'false') {
    logger.info('Redis is disabled');
    return null;
  }

  try {
    const redisConfig = {
      socket: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379
      },
      password: process.env.REDIS_PASSWORD || undefined,
      database: process.env.REDIS_DB || 0
    };

    // Main client
    redisClient = redis.createClient(redisConfig);
    await redisClient.connect();
    logger.info('Redis main client connected');

    // Pub/Sub clients
    redisPub = redis.createClient(redisConfig);
    await redisPub.connect();
    logger.info('Redis pub client connected');

    redisSub = redis.createClient(redisConfig);
    await redisSub.connect();
    logger.info('Redis sub client connected');

    return redisClient;
  } catch (error) {
    logger.warn('Redis connection failed, continuing without cache', {
      error: error.message
    });
    return null;
  }
}

function getRedisClient() {
  return redisClient;
}

function getRedisPub() {
  return redisPub;
}

function getRedisSub() {
  return redisSub;
}

module.exports = {
  initializeRedis,
  getRedisClient,
  getRedisPub,
  getRedisSub
};
