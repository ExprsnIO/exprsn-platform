/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileVault Storage Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

// Load environment variables
require('dotenv').config({ path: require('path').join(__dirname, '../../../../.env') });

module.exports = {
  // Default storage backend
  defaultBackend: process.env.DEFAULT_STORAGE_BACKEND || 's3',

  // S3 Configuration
  s3: {
    enabled: process.env.S3_ENABLED !== 'false',
    endpoint: process.env.S3_ENDPOINT || 'https://s3.amazonaws.com',
    bucket: process.env.S3_BUCKET || 'exprsn-filevault',
    region: process.env.S3_REGION || 'us-east-1',
    accessKeyId: process.env.S3_ACCESS_KEY || '',
    secretAccessKey: process.env.S3_SECRET_KEY || '',
    maxFileSize: parseInt(process.env.S3_MAX_FILE_SIZE || '5497558138880', 10) // 5TB
  },

  // Local disk configuration
  disk: {
    enabled: process.env.DISK_ENABLED !== 'false',
    storagePath: process.env.DISK_STORAGE_PATH || '/var/filevault/storage',
    maxSize: parseInt(process.env.DISK_MAX_SIZE || '1099511627776', 10), // 1TB
    maxFileSize: parseInt(process.env.DISK_MAX_FILE_SIZE || '10737418240', 10) // 10GB
  },

  // IPFS Configuration
  ipfs: {
    enabled: process.env.IPFS_ENABLED === 'true',
    apiUrl: process.env.IPFS_API_URL || 'http://localhost:5001',
    gatewayUrl: process.env.IPFS_GATEWAY_URL || 'https://ipfs.exprsn.io',
    maxFileSize: parseInt(process.env.IPFS_MAX_FILE_SIZE || '107374182400', 10) // 100GB
  }
};
