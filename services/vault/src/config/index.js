/**
 * Exprsn Vault - Configuration
 */

require('dotenv').config();

module.exports = {
  port: parseInt(process.env.VAULT_PORT || '3013', 10),
  env: process.env.NODE_ENV || 'development',

  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'exprsn_vault',
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  },

  // Encryption
  encryption: {
    algorithm: 'aes-256-gcm',
    masterKey: process.env.VAULT_MASTER_KEY || '',
    keyRotationDays: parseInt(process.env.KEY_ROTATION_DAYS || '90', 10)
  },

  // Access control
  access: {
    maxSecretVersions: parseInt(process.env.MAX_SECRET_VERSIONS || '10', 10),
    auditEnabled: process.env.AUDIT_ENABLED !== 'false'
  }
};
