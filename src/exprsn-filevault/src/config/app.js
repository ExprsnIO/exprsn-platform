/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileVault Application Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.FILEVAULT_SERVICE_PORT || '3007', 10),
  host: process.env.FILEVAULT_SERVICE_HOST || 'localhost',
  domain: process.env.FILEVAULT_DOMAIN || 'filevault.exprsn.io',

  // File upload limits
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10737418240', 10), // 10GB
  maxUploadChunkSize: parseInt(process.env.MAX_UPLOAD_CHUNK_SIZE || '10485760', 10), // 10MB
  maxVersionsPerFile: parseInt(process.env.MAX_VERSIONS_PER_FILE || '100', 10),

  // Feature flags
  enableDeduplication: process.env.ENABLE_DEDUPLICATION === 'true',
  enableEncryptionAtRest: process.env.ENABLE_ENCRYPTION_AT_REST === 'true',
  enableVirusScanning: process.env.ENABLE_VIRUS_SCANNING === 'true',

  // CORS settings
  corsOrigins: process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',') : ['*']
};
