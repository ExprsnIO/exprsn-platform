require('dotenv').config();

module.exports = {
  env: process.env.NODE_ENV || 'development',
  service: {
    name: process.env.SERVICE_NAME || 'exprsn-nexus',
    port: parseInt(process.env.SERVICE_PORT, 10) || 3011,
    host: process.env.SERVICE_HOST || 'localhost'
  },
  database: {
    host: process.env.PG_HOST || process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.PG_PORT, 10) || parseInt(process.env.DB_PORT, 10) || 5432,
    database: process.env.PG_DATABASE || process.env.DB_NAME || 'exprsn_nexus',
    username: process.env.PG_USER || process.env.DB_USER || 'exprsn_nexus_user',
    password: process.env.PG_PASSWORD || process.env.DB_PASSWORD,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: 10,
      min: 2,
      acquire: 30000,
      idle: 10000
    }
  },
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB, 10) || 0,
    keyPrefix: 'nexus:'
  },
  ca: {
    serviceUrl: process.env.CA_SERVICE_URL || 'http://localhost:3000',
    rootCertPath: process.env.CA_ROOT_CERT_PATH,
    domain: process.env.NEXUS_CA_DOMAIN || 'nexus.exprsn.io',
    certSerial: process.env.NEXUS_CERT_SERIAL,
    privateKeyPath: process.env.NEXUS_PRIVATE_KEY_PATH,
    certificatePath: process.env.NEXUS_CERTIFICATE_PATH,
    ocspUrl: process.env.OCSP_RESPONDER_URL || 'http://localhost:2560'
  },
  services: {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    timeline: process.env.TIMELINE_SERVICE_URL || 'http://localhost:3004',
    spark: process.env.SPARK_SERVICE_URL || 'http://localhost:3002',
    filevault: process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007',
    moderator: process.env.MODERATOR_SERVICE_URL || 'http://localhost:3006',
    herald: process.env.HERALD_SERVICE_URL || 'http://localhost:3014',
    live: process.env.LIVE_SERVICE_URL || 'http://localhost:3009'
  },
  features: {
    enableFederation: process.env.ENABLE_FEDERATION === 'true',
    enableDaoGovernance: process.env.ENABLE_DAO_GOVERNANCE === 'true',
    maxGroupSize: parseInt(process.env.MAX_GROUP_SIZE, 10) || 10000,
    maxGroupsPerUser: parseInt(process.env.MAX_GROUPS_PER_USER, 10) || 1000
  },
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json'
  }
};
