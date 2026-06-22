/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileVault Redis Cache Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  enabled: process.env.REDIS_ENABLED !== 'false',
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: 'filevault:',

  ttl: {
    fileMetadata: 3600, // 1 hour
    uploadSession: 86400, // 24 hours
    shareLink: 300 // 5 minutes
  }
};
