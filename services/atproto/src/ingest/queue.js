/**
 * The shared Bull 'moderation' queue. Same name + Redis connection as the
 * moderator's queue (services/moderator) so our jobs and the moderator's
 * coexist; we use a distinct job name ('moderate-atproto') with its own
 * processor (moderationBridge) registered by the atproto worker.
 */

const Bull = require('bull');
const config = require('../../config');

const redis = {
  host: config.redis.host,
  port: config.redis.port,
  password: config.redis.password,
  db: config.redis.db,
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
};

const moderationQueue = new Bull('moderation', { redis });

module.exports = { moderationQueue };
