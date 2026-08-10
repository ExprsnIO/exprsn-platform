/**
 * Enterprise Configuration Schemas
 * Comprehensive validation schemas for all Exprsn services
 */

const Joi = require('joi');

/**
 * Common schema components
 */
const commonSchemas = {
  // Database configuration
  database: Joi.object({
    DB_HOST: Joi.string().hostname().default('localhost').description('Database host'),
    DB_PORT: Joi.number().port().default(5432).description('Database port'),
    DB_NAME: Joi.string().alphanum().min(3).max(63).required().description('Database name'),
    DB_USER: Joi.string().min(1).max(63).required().description('Database user'),
    DB_PASSWORD: Joi.string().allow('').default('').description('Database password'),
    DB_SSL: Joi.boolean().default(false).description('Enable SSL for database'),
    DB_POOL_MIN: Joi.number().min(0).default(2).description('Minimum pool size'),
    DB_POOL_MAX: Joi.number().min(1).default(10).description('Maximum pool size'),
    DB_CONNECTION_TIMEOUT: Joi.number().min(1000).default(30000).description('Connection timeout (ms)'),
    DB_IDLE_TIMEOUT: Joi.number().min(1000).default(10000).description('Idle timeout (ms)')
  }),

  // Redis configuration
  redis: Joi.object({
    REDIS_ENABLED: Joi.boolean().default(true).description('Enable Redis'),
    REDIS_HOST: Joi.string().hostname().default('localhost').description('Redis host'),
    REDIS_PORT: Joi.number().port().default(6379).description('Redis port'),
    REDIS_PASSWORD: Joi.string().allow('').default('').description('Redis password'),
    REDIS_DB: Joi.number().min(0).max(15).default(0).description('Redis database number'),
    REDIS_KEY_PREFIX: Joi.string().default('').description('Redis key prefix'),
    REDIS_TLS_ENABLED: Joi.boolean().default(false).description('Enable Redis TLS'),
    REDIS_SENTINEL_ENABLED: Joi.boolean().default(false).description('Enable Redis Sentinel'),
    REDIS_SENTINEL_HOSTS: Joi.string().default('').description('Sentinel hosts (comma-separated)'),
    REDIS_SENTINEL_NAME: Joi.string().default('mymaster').description('Sentinel master name')
  }),

  // Application basics
  application: Joi.object({
    NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development').description('Environment'),
    PORT: Joi.number().port().required().description('Service port'),
    HOST: Joi.string().hostname().default('localhost').description('Service host'),
    APP_URL: Joi.string().uri().description('Application URL'),
    SERVICE_NAME: Joi.string().required().description('Service name'),
    LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info').description('Log level'),
    LOG_FILE: Joi.string().default('./logs/service.log').description('Log file path'),
    LOG_MAX_SIZE: Joi.string().default('20m').description('Max log file size'),
    LOG_MAX_FILES: Joi.number().min(1).default(5).description('Max log files to keep')
  }),

  // Security basics
  security: Joi.object({
    JWT_SECRET: Joi.string().min(32).required().description('JWT secret key'),
    JWT_EXPIRY: Joi.string().default('24h').description('JWT expiry duration'),
    JWT_REFRESH_EXPIRY: Joi.string().default('7d').description('JWT refresh token expiry'),
    SESSION_SECRET: Joi.string().min(16).required().description('Session secret'),
    SESSION_MAX_AGE: Joi.number().min(60000).default(86400000).description('Session max age (ms)'),
    CORS_ORIGIN: Joi.string().default('*').description('CORS allowed origins'),
    CORS_CREDENTIALS: Joi.boolean().default(true).description('Allow credentials'),
    RATE_LIMIT_WINDOW: Joi.number().min(1000).default(900000).description('Rate limit window (ms)'),
    RATE_LIMIT_MAX: Joi.number().min(1).default(1000).description('Max requests per window'),
    HELMET_ENABLED: Joi.boolean().default(true).description('Enable Helmet security headers')
  }),

  // Monitoring & Health
  monitoring: Joi.object({
    HEALTH_CHECK_ENABLED: Joi.boolean().default(true).description('Enable health checks'),
    HEALTH_CHECK_INTERVAL: Joi.number().min(1000).default(30000).description('Health check interval (ms)'),
    METRICS_ENABLED: Joi.boolean().default(true).description('Enable metrics collection'),
    METRICS_PORT: Joi.number().port().description('Metrics port'),
    PROMETHEUS_ENABLED: Joi.boolean().default(false).description('Enable Prometheus metrics'),
    OPENTELEMETRY_ENABLED: Joi.boolean().default(false).description('Enable OpenTelemetry'),
    OTEL_ENDPOINT: Joi.string().uri().description('OpenTelemetry endpoint'),
    OTEL_SERVICE_NAME: Joi.string().description('OpenTelemetry service name'),
    APM_ENABLED: Joi.boolean().default(false).description('Enable APM'),
    APM_SERVER_URL: Joi.string().uri().description('APM server URL'),
    APM_SECRET_TOKEN: Joi.string().description('APM secret token')
  })
};

/**
 * Certificate Authority (exprsn-ca) Schema
 */
const caConfigSchema = Joi.object({
  // Application configuration
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development').description('Environment'),
  PORT: Joi.number().port().required().description('Service port'),
  HOST: Joi.string().hostname().default('localhost').description('Service host'),
  APP_URL: Joi.string().uri().description('Application URL'),
  SERVICE_NAME: Joi.string().required().description('Service name'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info').description('Log level'),
  LOG_FILE: Joi.string().default('./logs/service.log').description('Log file path'),
  LOG_MAX_SIZE: Joi.string().default('20m').description('Max log file size'),
  LOG_MAX_FILES: Joi.number().min(1).default(5).description('Max log files to keep'),

  // Database configuration
  DB_HOST: Joi.string().hostname().default('localhost').description('Database host'),
  DB_PORT: Joi.number().port().default(5432).description('Database port'),
  DB_NAME: Joi.string().alphanum().min(3).max(63).required().description('Database name'),
  DB_USER: Joi.string().min(1).max(63).required().description('Database user'),
  DB_PASSWORD: Joi.string().allow('').default('').description('Database password'),
  DB_SSL: Joi.boolean().default(false).description('Enable SSL for database'),
  DB_POOL_MIN: Joi.number().min(0).default(2).description('Minimum pool size'),
  DB_POOL_MAX: Joi.number().min(1).default(10).description('Maximum pool size'),

  // Redis configuration
  REDIS_ENABLED: Joi.boolean().default(true).description('Enable Redis'),
  REDIS_HOST: Joi.string().hostname().default('localhost').description('Redis host'),
  REDIS_PORT: Joi.number().port().default(6379).description('Redis port'),
  REDIS_PASSWORD: Joi.string().allow('').default('').description('Redis password'),
  REDIS_DB: Joi.number().min(0).max(15).default(0).description('Redis database number'),

  // Security configuration
  JWT_SECRET: Joi.string().min(32).required().description('JWT secret key'),
  JWT_EXPIRY: Joi.string().default('24h').description('JWT expiry duration'),
  SESSION_SECRET: Joi.string().min(16).required().description('Session secret'),
  SESSION_MAX_AGE: Joi.number().min(60000).default(86400000).description('Session max age (ms)'),
  CORS_ORIGIN: Joi.string().default('*').description('CORS allowed origins'),
  RATE_LIMIT_WINDOW: Joi.number().min(1000).default(900000).description('Rate limit window (ms)'),
  RATE_LIMIT_MAX: Joi.number().min(1).default(1000).description('Max requests per window'),

  // Monitoring configuration
  HEALTH_CHECK_ENABLED: Joi.boolean().default(true).description('Enable health checks'),
  METRICS_ENABLED: Joi.boolean().default(true).description('Enable metrics collection'),
  PROMETHEUS_ENABLED: Joi.boolean().default(false).description('Enable Prometheus metrics'),

  // CA-Specific Configuration
  CA_NAME: Joi.string().min(3).max(100).required().description('Certificate Authority name'),
  CA_DOMAIN: Joi.string().hostname().required().description('CA domain'),
  CA_COUNTRY: Joi.string().length(2).uppercase().required().description('Country code (ISO 3166-1 alpha-2)'),
  CA_STATE: Joi.string().min(2).max(50).required().description('State/Province'),
  CA_LOCALITY: Joi.string().min(2).max(50).required().description('City/Locality'),
  CA_ORGANIZATION: Joi.string().min(2).max(100).required().description('Organization name'),
  CA_ORGANIZATIONAL_UNIT: Joi.string().min(2).max(100).default('Certificate Authority').description('Organizational unit'),
  CA_EMAIL: Joi.string().email().description('CA contact email'),
  CA_VALIDITY_DAYS: Joi.number().min(365).max(7300).default(3650).description('CA certificate validity (days)'),
  CA_KEY_SIZE: Joi.number().valid(2048, 4096, 8192).default(4096).description('CA key size (bits)'),
  CA_SIGNATURE_ALGORITHM: Joi.string().valid('sha256', 'sha384', 'sha512').default('sha256').description('Signature algorithm'),

  // Certificate Management
  CERT_DEFAULT_VALIDITY_DAYS: Joi.number().min(1).max(825).default(365).description('Default cert validity (days)'),
  CERT_MAX_VALIDITY_DAYS: Joi.number().min(1).max(825).default(825).description('Max cert validity (days)'),
  CERT_MIN_KEY_SIZE: Joi.number().valid(2048, 4096).default(2048).description('Min certificate key size'),
  CERT_AUTO_RENEWAL_ENABLED: Joi.boolean().default(true).description('Enable auto-renewal'),
  CERT_RENEWAL_DAYS_BEFORE: Joi.number().min(1).max(90).default(30).description('Renewal days before expiry'),

  // OCSP Configuration
  OCSP_ENABLED: Joi.boolean().default(true).description('Enable OCSP responder'),
  OCSP_PORT: Joi.number().port().default(2560).description('OCSP port'),
  OCSP_URL: Joi.string().uri().description('OCSP responder URL'),
  OCSP_CACHE_ENABLED: Joi.boolean().default(true).description('Enable OCSP cache'),
  OCSP_CACHE_TTL: Joi.number().min(60).default(3600).description('OCSP cache TTL (seconds)'),
  OCSP_SIGNATURE_ALGORITHM: Joi.string().valid('sha256', 'sha384', 'sha512').default('sha256').description('OCSP signature algorithm'),

  // CRL Configuration
  CRL_ENABLED: Joi.boolean().default(true).description('Enable CRL'),
  CRL_UPDATE_INTERVAL: Joi.number().min(3600).default(86400).description('CRL update interval (seconds)'),
  CRL_NEXT_UPDATE_DAYS: Joi.number().min(1).max(30).default(7).description('CRL next update (days)'),
  CRL_URL: Joi.string().uri().description('CRL distribution point URL'),

  // Storage Configuration
  STORAGE_TYPE: Joi.string().valid('disk', 's3', 'postgresql', 'vault').default('postgresql').description('Storage backend'),
  STORAGE_PATH: Joi.string().default('./storage').description('Storage path (disk)'),
  STORAGE_ENCRYPTION_ENABLED: Joi.boolean().default(true).description('Enable storage encryption'),
  STORAGE_ENCRYPTION_ALGORITHM: Joi.string().valid('aes-256-gcm', 'aes-256-cbc').default('aes-256-gcm').description('Encryption algorithm'),

  // S3 Storage (when STORAGE_TYPE='s3')
  S3_BUCKET: Joi.string().when('STORAGE_TYPE', { is: 's3', then: Joi.required() }).description('S3 bucket name'),
  S3_REGION: Joi.string().when('STORAGE_TYPE', { is: 's3', then: Joi.required() }).description('S3 region'),
  S3_ACCESS_KEY: Joi.string().when('STORAGE_TYPE', { is: 's3', then: Joi.required() }).description('S3 access key'),
  S3_SECRET_KEY: Joi.string().when('STORAGE_TYPE', { is: 's3', then: Joi.required() }).description('S3 secret key'),
  S3_PREFIX: Joi.string().default('ca/').description('S3 key prefix'),

  // Vault Integration (when STORAGE_TYPE='vault')
  VAULT_ENABLED: Joi.boolean().default(false).description('Enable Vault integration'),
  VAULT_URL: Joi.string().uri().when('VAULT_ENABLED', { is: true, then: Joi.required() }).description('Vault URL'),
  VAULT_TOKEN: Joi.string().when('VAULT_ENABLED', { is: true, then: Joi.required() }).description('Vault token'),
  VAULT_NAMESPACE: Joi.string().description('Vault namespace'),
  VAULT_MOUNT_PATH: Joi.string().default('secret').description('Vault mount path'),

  // Token Management
  TOKEN_DEFAULT_EXPIRY: Joi.number().min(60).default(3600).description('Default token expiry (seconds)'),
  TOKEN_MAX_EXPIRY: Joi.number().min(3600).default(2592000).description('Max token expiry (seconds)'),
  TOKEN_SIGNATURE_ALGORITHM: Joi.string().valid('RS256', 'RS384', 'RS512', 'ES256', 'ES384', 'ES512').default('RS256').description('Token signature algorithm'),

  // Cluster Configuration
  CLUSTER_ENABLED: Joi.boolean().default(false).description('Enable cluster mode'),
  CLUSTER_WORKERS: Joi.number().min(1).max(64).default(2).description('Number of cluster workers'),
  CLUSTER_MAX_MEMORY: Joi.string().default('512M').description('Max memory per worker'),

  // Admin UI
  ADMIN_ENABLED: Joi.boolean().default(true).description('Enable admin UI'),
  ADMIN_PATH: Joi.string().default('/admin').description('Admin UI path'),
  ADMIN_USERNAME: Joi.string().min(3).description('Admin username'),
  ADMIN_PASSWORD: Joi.string().min(8).description('Admin password')
}).options({ stripUnknown: true, abortEarly: false });

/**
 * Timeline Service (exprsn-timeline) Schema
 */
const timelineConfigSchema = Joi.object({
  // Application configuration
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development').description('Environment'),
  PORT: Joi.number().port().required().description('Service port'),
  HOST: Joi.string().hostname().default('localhost').description('Service host'),
  APP_URL: Joi.string().uri().description('Application URL'),
  SERVICE_NAME: Joi.string().required().description('Service name'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info').description('Log level'),
  LOG_FILE: Joi.string().default('./logs/service.log').description('Log file path'),

  // Database configuration
  DB_HOST: Joi.string().hostname().default('localhost').description('Database host'),
  DB_PORT: Joi.number().port().default(5432).description('Database port'),
  DB_NAME: Joi.string().alphanum().min(3).max(63).required().description('Database name'),
  DB_USER: Joi.string().min(1).max(63).required().description('Database user'),
  DB_PASSWORD: Joi.string().allow('').default('').description('Database password'),
  DB_SSL: Joi.boolean().default(false).description('Enable SSL for database'),
  DB_POOL_MIN: Joi.number().min(0).default(2).description('Minimum pool size'),
  DB_POOL_MAX: Joi.number().min(1).default(10).description('Maximum pool size'),

  // Redis configuration
  REDIS_ENABLED: Joi.boolean().default(true).description('Enable Redis'),
  REDIS_HOST: Joi.string().hostname().default('localhost').description('Redis host'),
  REDIS_PORT: Joi.number().port().default(6379).description('Redis port'),
  REDIS_PASSWORD: Joi.string().allow('').default('').description('Redis password'),
  REDIS_DB: Joi.number().min(0).max(15).default(0).description('Redis database number'),
  REDIS_KEY_PREFIX: Joi.string().default('').description('Redis key prefix'),

  // Security configuration
  JWT_SECRET: Joi.string().min(32).required().description('JWT secret key'),
  CORS_ORIGIN: Joi.string().default('*').description('CORS allowed origins'),
  RATE_LIMIT_WINDOW: Joi.number().min(1000).default(900000).description('Rate limit window (ms)'),
  RATE_LIMIT_MAX: Joi.number().min(1).default(1000).description('Max requests per window'),

  // Monitoring configuration
  HEALTH_CHECK_ENABLED: Joi.boolean().default(true).description('Enable health checks'),
  METRICS_ENABLED: Joi.boolean().default(true).description('Enable metrics collection'),
  PROMETHEUS_ENABLED: Joi.boolean().default(false).description('Enable Prometheus metrics'),

  // CA Integration
  CA_URL: Joi.string().uri().required().description('CA service URL'),
  CA_TOKEN_REFRESH_INTERVAL: Joi.number().min(60000).default(300000).description('CA token refresh interval (ms)'),

  // Timeline Features
  MAX_POST_LENGTH: Joi.number().min(100).max(10000).default(5000).description('Max post length (characters)'),
  MAX_REPLY_DEPTH: Joi.number().min(1).max(10).default(5).description('Max reply depth'),
  ENABLE_POLLS: Joi.boolean().default(true).description('Enable polls'),
  ENABLE_MEDIA: Joi.boolean().default(true).description('Enable media attachments'),
  MAX_MEDIA_PER_POST: Joi.number().min(0).max(10).default(4).description('Max media per post'),
  MAX_MEDIA_SIZE_MB: Joi.number().min(1).max(100).default(10).description('Max media size (MB)'),

  // Feed Configuration
  DEFAULT_FEED_SIZE: Joi.number().min(10).max(100).default(20).description('Default feed page size'),
  MAX_FEED_SIZE: Joi.number().min(10).max(500).default(100).description('Max feed page size'),
  FEED_CACHE_TTL: Joi.number().min(10).max(300).default(60).description('Feed cache TTL (seconds)'),
  TRENDING_ALGORITHM: Joi.string().valid('simple', 'hacker-news', 'reddit').default('hacker-news').description('Trending algorithm'),
  TRENDING_WINDOW_HOURS: Joi.number().min(1).max(168).default(24).description('Trending window (hours)'),

  // Background Jobs (Bull Queue)
  BULL_REDIS_HOST: Joi.string().hostname().default('localhost').description('Bull Redis host'),
  BULL_REDIS_PORT: Joi.number().port().default(6379).description('Bull Redis port'),
  BULL_REDIS_DB: Joi.number().min(0).max(15).default(1).description('Bull Redis DB'),
  BULL_CONCURRENCY: Joi.number().min(1).max(100).default(10).description('Bull job concurrency'),
  BULL_ATTEMPTS: Joi.number().min(1).max(10).default(3).description('Bull job retry attempts'),
  BULL_BACKOFF_DELAY: Joi.number().min(1000).max(60000).default(5000).description('Bull backoff delay (ms)'),

  // Job-specific settings
  FANOUT_ENABLED: Joi.boolean().default(true).description('Enable fanout jobs'),
  FANOUT_BATCH_SIZE: Joi.number().min(10).max(1000).default(100).description('Fanout batch size'),
  TRENDING_JOB_INTERVAL: Joi.number().min(60000).max(3600000).default(300000).description('Trending job interval (ms)'),
  INDEXING_ENABLED: Joi.boolean().default(true).description('Enable search indexing'),
  NOTIFICATION_ENABLED: Joi.boolean().default(true).description('Enable notifications'),

  // Search Configuration
  SEARCH_ENABLED: Joi.boolean().default(true).description('Enable search'),
  SEARCH_ENGINE: Joi.string().valid('postgres', 'elasticsearch', 'opensearch').default('postgres').description('Search engine'),
  ELASTICSEARCH_URL: Joi.string().uri().when('SEARCH_ENGINE', { is: 'elasticsearch', then: Joi.required() }).description('Elasticsearch URL'),
  ELASTICSEARCH_INDEX: Joi.string().default('timeline').description('Elasticsearch index'),

  // Socket.IO Configuration
  SOCKETIO_ENABLED: Joi.boolean().default(true).description('Enable Socket.IO'),
  SOCKETIO_PATH: Joi.string().default('/socket.io').description('Socket.IO path'),
  SOCKETIO_CORS_ORIGIN: Joi.string().default('*').description('Socket.IO CORS origin'),
  SOCKETIO_PING_TIMEOUT: Joi.number().min(1000).default(60000).description('Socket.IO ping timeout (ms)'),
  SOCKETIO_PING_INTERVAL: Joi.number().min(1000).default(25000).description('Socket.IO ping interval (ms)'),

  // Content Moderation
  MODERATION_ENABLED: Joi.boolean().default(false).description('Enable moderation service'),
  MODERATOR_SERVICE_URL: Joi.string().uri().description('Moderator service URL'),
  AUTO_MODERATION: Joi.boolean().default(false).description('Enable auto-moderation'),

  // Rate Limiting (per-user)
  USER_POST_LIMIT_PER_HOUR: Joi.number().min(1).max(1000).default(100).description('User post limit per hour'),
  USER_REPLY_LIMIT_PER_HOUR: Joi.number().min(1).max(1000).default(200).description('User reply limit per hour'),
  USER_LIKE_LIMIT_PER_HOUR: Joi.number().min(1).max(10000).default(1000).description('User like limit per hour')
}).options({ stripUnknown: true, abortEarly: false });

/**
 * Nexus Service (exprsn-nexus) Schema
 */
const nexusConfigSchema = Joi.object({
  // Application configuration
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development').description('Environment'),
  PORT: Joi.number().port().required().description('Service port'),
  HOST: Joi.string().hostname().default('localhost').description('Service host'),
  APP_URL: Joi.string().uri().description('Application URL'),
  SERVICE_NAME: Joi.string().required().description('Service name'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info').description('Log level'),
  LOG_FILE: Joi.string().default('./logs/service.log').description('Log file path'),

  // Database configuration
  DB_HOST: Joi.string().hostname().default('localhost').description('Database host'),
  DB_PORT: Joi.number().port().default(5432).description('Database port'),
  DB_NAME: Joi.string().alphanum().min(3).max(63).required().description('Database name'),
  DB_USER: Joi.string().min(1).max(63).required().description('Database user'),
  DB_PASSWORD: Joi.string().allow('').default('').description('Database password'),
  DB_SSL: Joi.boolean().default(false).description('Enable SSL for database'),
  DB_POOL_MIN: Joi.number().min(0).default(2).description('Minimum pool size'),
  DB_POOL_MAX: Joi.number().min(1).default(10).description('Maximum pool size'),

  // Redis configuration
  REDIS_ENABLED: Joi.boolean().default(true).description('Enable Redis'),
  REDIS_HOST: Joi.string().hostname().default('localhost').description('Redis host'),
  REDIS_PORT: Joi.number().port().default(6379).description('Redis port'),
  REDIS_PASSWORD: Joi.string().allow('').default('').description('Redis password'),
  REDIS_DB: Joi.number().min(0).max(15).default(0).description('Redis database number'),
  REDIS_KEY_PREFIX: Joi.string().default('').description('Redis key prefix'),

  // Security configuration
  JWT_SECRET: Joi.string().min(32).required().description('JWT secret key'),
  CORS_ORIGIN: Joi.string().default('*').description('CORS allowed origins'),
  RATE_LIMIT_WINDOW: Joi.number().min(1000).default(900000).description('Rate limit window (ms)'),
  RATE_LIMIT_MAX: Joi.number().min(1).default(1000).description('Max requests per window'),

  // Monitoring configuration
  HEALTH_CHECK_ENABLED: Joi.boolean().default(true).description('Enable health checks'),
  METRICS_ENABLED: Joi.boolean().default(true).description('Enable metrics collection'),
  PROMETHEUS_ENABLED: Joi.boolean().default(false).description('Enable Prometheus metrics'),

  // CA Integration
  CA_URL: Joi.string().uri().required().description('CA service URL'),

  // Group Configuration
  MAX_GROUP_NAME_LENGTH: Joi.number().min(10).max(200).default(100).description('Max group name length'),
  MAX_GROUP_DESCRIPTION_LENGTH: Joi.number().min(100).max(10000).default(2000).description('Max description length'),
  MAX_GROUPS_PER_USER: Joi.number().min(1).max(10000).default(1000).description('Max groups per user'),
  MAX_GROUP_SIZE: Joi.number().min(2).max(1000000).default(10000).description('Max group size'),
  DEFAULT_GROUP_VISIBILITY: Joi.string().valid('public', 'private', 'unlisted').default('public').description('Default visibility'),
  DEFAULT_JOIN_MODE: Joi.string().valid('open', 'request', 'invite').default('request').description('Default join mode'),

  // Governance Features
  ENABLE_DAO_GOVERNANCE: Joi.boolean().default(false).description('Enable DAO governance'),
  ENABLE_PROPOSALS: Joi.boolean().default(true).description('Enable proposals'),
  DEFAULT_VOTING_PERIOD_HOURS: Joi.number().min(1).max(720).default(168).description('Default voting period (hours)'),
  DEFAULT_QUORUM_PERCENTAGE: Joi.number().min(1).max(100).default(51).description('Default quorum percentage'),
  MIN_PROPOSAL_SUPPORT: Joi.number().min(1).max(100).default(10).description('Min members to create proposal'),

  // Event Configuration
  MAX_EVENT_TITLE_LENGTH: Joi.number().min(10).max(200).default(100).description('Max event title length'),
  MAX_EVENT_DESCRIPTION_LENGTH: Joi.number().min(100).max(10000).default(5000).description('Max event description'),
  MAX_EVENTS_PER_GROUP: Joi.number().min(10).max(10000).default(1000).description('Max events per group'),
  ENABLE_RECURRING_EVENTS: Joi.boolean().default(true).description('Enable recurring events'),
  ENABLE_VIRTUAL_EVENTS: Joi.boolean().default(true).description('Enable virtual events'),
  DEFAULT_EVENT_TIMEZONE: Joi.string().default('UTC').description('Default timezone'),

  // Calendar Integration
  ICAL_ENABLED: Joi.boolean().default(true).description('Enable iCal export'),
  CALDAV_ENABLED: Joi.boolean().default(false).description('Enable CalDAV'),
  CALDAV_URL: Joi.string().uri().description('CalDAV server URL'),
  CARDDAV_ENABLED: Joi.boolean().default(false).description('Enable CardDAV'),
  CARDDAV_URL: Joi.string().uri().description('CardDAV server URL'),

  // Discovery & Recommendations
  TRENDING_ENABLED: Joi.boolean().default(true).description('Enable trending groups'),
  TRENDING_ALGORITHM: Joi.string().valid('simple', 'hacker-news', 'time-decay').default('hacker-news').description('Trending algorithm'),
  TRENDING_CACHE_TTL: Joi.number().min(60).max(3600).default(300).description('Trending cache TTL (seconds)'),
  RECOMMENDATIONS_ENABLED: Joi.boolean().default(true).description('Enable recommendations'),
  RECOMMENDATION_ALGORITHM: Joi.string().valid('collaborative', 'content-based', 'hybrid').default('hybrid').description('Recommendation algorithm'),
  MIN_RECOMMENDATION_SCORE: Joi.number().min(0).max(1).default(0.3).description('Min recommendation score'),

  // Moderation
  MODERATION_ENABLED: Joi.boolean().default(false).description('Enable moderation service'),
  MODERATOR_SERVICE_URL: Joi.string().uri().description('Moderator service URL'),
  AUTO_MODERATION: Joi.boolean().default(false).description('Enable auto-moderation'),
  FLAG_THRESHOLD_AUTO_HIDE: Joi.number().min(1).max(100).default(5).description('Flags before auto-hide'),

  // Federation (ActivityPub)
  ENABLE_FEDERATION: Joi.boolean().default(false).description('Enable ActivityPub federation'),
  FEDERATION_DOMAIN: Joi.string().hostname().description('Federation domain'),
  FEDERATION_INBOX_PATH: Joi.string().default('/inbox').description('Federation inbox path'),
  FEDERATION_OUTBOX_PATH: Joi.string().default('/outbox').description('Federation outbox path'),

  // Categories
  ENABLE_CATEGORIES: Joi.boolean().default(true).description('Enable categories'),
  MAX_CATEGORIES: Joi.number().min(10).max(1000).default(100).description('Max categories'),
  MAX_CATEGORY_DEPTH: Joi.number().min(1).max(5).default(3).description('Max category depth')
}).options({ stripUnknown: true, abortEarly: false });

/**
 * Vault Service (exprsn-vault) Schema
 */
const vaultConfigSchema = Joi.object({
  // Application configuration
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development').description('Environment'),
  PORT: Joi.number().port().required().description('Service port'),
  HOST: Joi.string().hostname().default('localhost').description('Service host'),
  APP_URL: Joi.string().uri().description('Application URL'),
  SERVICE_NAME: Joi.string().required().description('Service name'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info').description('Log level'),
  LOG_FILE: Joi.string().default('./logs/service.log').description('Log file path'),

  // Database configuration
  DB_HOST: Joi.string().hostname().default('localhost').description('Database host'),
  DB_PORT: Joi.number().port().default(5432).description('Database port'),
  DB_NAME: Joi.string().alphanum().min(3).max(63).required().description('Database name'),
  DB_USER: Joi.string().min(1).max(63).required().description('Database user'),
  DB_PASSWORD: Joi.string().allow('').default('').description('Database password'),
  DB_SSL: Joi.boolean().default(false).description('Enable SSL for database'),
  DB_POOL_MIN: Joi.number().min(0).default(2).description('Minimum pool size'),
  DB_POOL_MAX: Joi.number().min(1).default(10).description('Maximum pool size'),

  // Redis configuration
  REDIS_ENABLED: Joi.boolean().default(true).description('Enable Redis'),
  REDIS_HOST: Joi.string().hostname().default('localhost').description('Redis host'),
  REDIS_PORT: Joi.number().port().default(6379).description('Redis port'),
  REDIS_PASSWORD: Joi.string().allow('').default('').description('Redis password'),
  REDIS_DB: Joi.number().min(0).max(15).default(0).description('Redis database number'),

  // Security configuration
  JWT_SECRET: Joi.string().min(32).required().description('JWT secret key'),
  CORS_ORIGIN: Joi.string().default('*').description('CORS allowed origins'),
  RATE_LIMIT_WINDOW: Joi.number().min(1000).default(900000).description('Rate limit window (ms)'),
  RATE_LIMIT_MAX: Joi.number().min(1).default(1000).description('Max requests per window'),

  // Monitoring configuration
  HEALTH_CHECK_ENABLED: Joi.boolean().default(true).description('Enable health checks'),
  METRICS_ENABLED: Joi.boolean().default(true).description('Enable metrics collection'),
  PROMETHEUS_ENABLED: Joi.boolean().default(false).description('Enable Prometheus metrics'),

  // CA Integration
  CA_URL: Joi.string().uri().required().description('CA service URL'),

  // Vault Core Configuration
  VAULT_UNSEALED: Joi.boolean().default(false).description('Vault unsealed status'),
  VAULT_SEAL_TYPE: Joi.string().valid('shamir', 'auto', 'transit', 'gcpckms', 'awskms', 'azurekeyvault').default('shamir').description('Seal type'),
  VAULT_SEAL_SHARES: Joi.number().min(1).max(255).default(5).description('Number of seal shares'),
  VAULT_SEAL_THRESHOLD: Joi.number().min(1).max(255).default(3).description('Seal threshold'),

  // Encryption
  MASTER_KEY_ALGORITHM: Joi.string().valid('aes-256-gcm', 'aes-256-cbc', 'chacha20-poly1305').default('aes-256-gcm').description('Master key algorithm'),
  KEY_ROTATION_ENABLED: Joi.boolean().default(true).description('Enable key rotation'),
  KEY_ROTATION_INTERVAL_DAYS: Joi.number().min(1).max(365).default(90).description('Key rotation interval (days)'),
  AUTO_SEAL_ENABLED: Joi.boolean().default(false).description('Enable auto-unseal'),

  // AWS KMS (when VAULT_SEAL_TYPE='awskms')
  AWS_KMS_ENABLED: Joi.boolean().default(false).description('Enable AWS KMS'),
  AWS_KMS_KEY_ID: Joi.string().when('AWS_KMS_ENABLED', { is: true, then: Joi.required() }).description('AWS KMS key ID'),
  AWS_KMS_REGION: Joi.string().when('AWS_KMS_ENABLED', { is: true, then: Joi.required() }).description('AWS region'),
  AWS_ACCESS_KEY_ID: Joi.string().description('AWS access key'),
  AWS_SECRET_ACCESS_KEY: Joi.string().description('AWS secret key'),

  // GCP KMS (when VAULT_SEAL_TYPE='gcpckms')
  GCP_KMS_ENABLED: Joi.boolean().default(false).description('Enable GCP KMS'),
  GCP_KMS_PROJECT: Joi.string().when('GCP_KMS_ENABLED', { is: true, then: Joi.required() }).description('GCP project'),
  GCP_KMS_LOCATION: Joi.string().when('GCP_KMS_ENABLED', { is: true, then: Joi.required() }).description('GCP location'),
  GCP_KMS_KEY_RING: Joi.string().when('GCP_KMS_ENABLED', { is: true, then: Joi.required() }).description('GCP key ring'),
  GCP_KMS_CRYPTO_KEY: Joi.string().when('GCP_KMS_ENABLED', { is: true, then: Joi.required() }).description('GCP crypto key'),

  // Azure Key Vault (when VAULT_SEAL_TYPE='azurekeyvault')
  AZURE_KEYVAULT_ENABLED: Joi.boolean().default(false).description('Enable Azure Key Vault'),
  AZURE_KEYVAULT_NAME: Joi.string().when('AZURE_KEYVAULT_ENABLED', { is: true, then: Joi.required() }).description('Azure Key Vault name'),
  AZURE_KEYVAULT_KEY_NAME: Joi.string().when('AZURE_KEYVAULT_ENABLED', { is: true, then: Joi.required() }).description('Azure key name'),
  AZURE_TENANT_ID: Joi.string().when('AZURE_KEYVAULT_ENABLED', { is: true, then: Joi.required() }).description('Azure tenant ID'),
  AZURE_CLIENT_ID: Joi.string().when('AZURE_KEYVAULT_ENABLED', { is: true, then: Joi.required() }).description('Azure client ID'),
  AZURE_CLIENT_SECRET: Joi.string().when('AZURE_KEYVAULT_ENABLED', { is: true, then: Joi.required() }).description('Azure client secret'),

  // Secret Management
  MAX_SECRET_SIZE_KB: Joi.number().min(1).max(1024).default(64).description('Max secret size (KB)'),
  SECRET_VERSIONING_ENABLED: Joi.boolean().default(true).description('Enable secret versioning'),
  MAX_SECRET_VERSIONS: Joi.number().min(1).max(100).default(10).description('Max secret versions'),
  SECRET_TTL_ENABLED: Joi.boolean().default(true).description('Enable secret TTL'),
  DEFAULT_SECRET_TTL_DAYS: Joi.number().min(1).max(3650).default(365).description('Default secret TTL (days)'),

  // Access Control
  ENABLE_POLICIES: Joi.boolean().default(true).description('Enable policies'),
  DEFAULT_POLICY: Joi.string().default('deny').description('Default policy'),
  ENABLE_NAMESPACES: Joi.boolean().default(true).description('Enable namespaces'),
  MAX_NAMESPACES: Joi.number().min(1).max(1000).default(100).description('Max namespaces'),

  // Audit
  AUDIT_ENABLED: Joi.boolean().default(true).description('Enable audit logging'),
  AUDIT_LOG_PATH: Joi.string().default('./logs/vault-audit.log').description('Audit log path'),
  AUDIT_LOG_FORMAT: Joi.string().valid('json', 'jsonx').default('json').description('Audit log format'),
  AUDIT_SOCKET_ENABLED: Joi.boolean().default(false).description('Enable audit socket'),
  AUDIT_SOCKET_PATH: Joi.string().description('Audit socket path'),
  AUDIT_SYSLOG_ENABLED: Joi.boolean().default(false).description('Enable syslog audit'),

  // HA & Replication
  HA_ENABLED: Joi.boolean().default(false).description('Enable high availability'),
  HA_STORAGE_TYPE: Joi.string().valid('consul', 'etcd', 'raft').default('raft').description('HA storage type'),
  REPLICATION_ENABLED: Joi.boolean().default(false).description('Enable replication'),
  REPLICATION_MODE: Joi.string().valid('performance', 'disaster-recovery').default('performance').description('Replication mode'),

  // Dynamic Secrets
  DYNAMIC_SECRETS_ENABLED: Joi.boolean().default(true).description('Enable dynamic secrets'),
  DATABASE_SECRET_ENGINE_ENABLED: Joi.boolean().default(true).description('Enable database secret engine'),
  AWS_SECRET_ENGINE_ENABLED: Joi.boolean().default(false).description('Enable AWS secret engine'),
  SSH_SECRET_ENGINE_ENABLED: Joi.boolean().default(false).description('Enable SSH secret engine'),

  // Transit (Encryption as a Service)
  TRANSIT_ENABLED: Joi.boolean().default(true).description('Enable transit engine'),
  TRANSIT_MOUNT_PATH: Joi.string().default('transit').description('Transit mount path'),
  TRANSIT_KEY_TYPE: Joi.string().valid('aes256-gcm96', 'chacha20-poly1305', 'ed25519', 'ecdsa-p256', 'rsa-2048', 'rsa-4096').default('aes256-gcm96').description('Transit key type'),
  TRANSIT_ALLOW_PLAINTEXT_BACKUP: Joi.boolean().default(false).description('Allow plaintext key backup'),

  // Performance Tuning
  CACHE_SIZE: Joi.number().min(0).default(32768).description('Cache size'),
  MAX_LEASE_TTL: Joi.string().default('768h').description('Max lease TTL'),
  DEFAULT_LEASE_TTL: Joi.string().default('768h').description('Default lease TTL'),
  DISABLE_MLOCK: Joi.boolean().default(false).description('Disable mlock'),
  DISABLE_CACHE: Joi.boolean().default(false).description('Disable cache')
}).options({ stripUnknown: true, abortEarly: false });

/**
 * Forge Service (exprsn-forge) Schema
 * Business Management Platform - CRM, ERP, Groupware
 */
const forgeConfigSchema = Joi.object({
  // Application configuration
  NODE_ENV: Joi.string().valid('development', 'staging', 'production').default('development').description('Environment'),
  PORT: Joi.number().port().required().description('Service port'),
  FORGE_PORT: Joi.number().port().description('Forge service port (alias)'),
  HOST: Joi.string().hostname().default('localhost').description('Service host'),
  APP_URL: Joi.string().uri().description('Application URL'),
  SERVICE_NAME: Joi.string().required().description('Service name'),
  LOG_LEVEL: Joi.string().valid('error', 'warn', 'info', 'debug', 'trace').default('info').description('Log level'),
  LOG_FILE: Joi.string().default('./logs/service.log').description('Log file path'),
  LOG_MAX_SIZE: Joi.string().default('20m').description('Max log file size'),
  LOG_MAX_FILES: Joi.number().min(1).default(5).description('Max log files to keep'),

  // Database configuration
  DB_HOST: Joi.string().hostname().default('localhost').description('Database host'),
  DB_PORT: Joi.number().port().default(5432).description('Database port'),
  DB_NAME: Joi.string().alphanum().min(3).max(63).required().description('Database name'),
  DB_USER: Joi.string().min(1).max(63).required().description('Database user'),
  DB_PASSWORD: Joi.string().allow('').default('').description('Database password'),
  DB_SSL: Joi.boolean().default(false).description('Enable SSL for database'),
  DB_POOL_MIN: Joi.number().min(0).default(5).description('Minimum pool size'),
  DB_POOL_MAX: Joi.number().min(1).default(20).description('Maximum pool size'),
  DB_LOGGING: Joi.boolean().default(false).description('Enable database query logging'),
  DB_CONNECTION_TIMEOUT: Joi.number().min(1000).default(30000).description('Connection timeout (ms)'),
  DB_IDLE_TIMEOUT: Joi.number().min(1000).default(10000).description('Idle timeout (ms)'),

  // Redis configuration
  REDIS_ENABLED: Joi.boolean().default(true).description('Enable Redis'),
  REDIS_HOST: Joi.string().hostname().default('localhost').description('Redis host'),
  REDIS_PORT: Joi.number().port().default(6379).description('Redis port'),
  REDIS_PASSWORD: Joi.string().allow('').default('').description('Redis password'),
  REDIS_DB: Joi.number().min(0).max(15).default(3).description('Redis database number'),
  REDIS_KEY_PREFIX: Joi.string().default('forge:').description('Redis key prefix'),

  // Security configuration
  JWT_SECRET: Joi.string().min(32).required().description('JWT secret key'),
  JWT_EXPIRY: Joi.string().default('24h').description('JWT expiry duration'),
  SESSION_SECRET: Joi.string().min(16).required().description('Session secret'),
  SESSION_LIFETIME: Joi.number().min(60000).default(3600000).description('Session lifetime (ms)'),
  SESSION_MAX_AGE: Joi.number().min(60000).default(3600000).description('Session max age (ms)'),
  BCRYPT_ROUNDS: Joi.number().min(10).max(15).default(12).description('BCrypt hash rounds'),
  CORS_ORIGIN: Joi.string().default('*').description('CORS allowed origins'),
  CORS_ORIGINS: Joi.string().default('*').description('CORS allowed origins (alias)'),
  CORS_CREDENTIALS: Joi.boolean().default(true).description('Allow credentials'),
  HELMET_ENABLED: Joi.boolean().default(true).description('Enable Helmet security headers'),

  // Rate Limiting
  RATE_LIMIT_ENABLED: Joi.boolean().default(true).description('Enable rate limiting'),
  RATE_LIMIT_WINDOW: Joi.number().min(1000).default(60000).description('Rate limit window (ms)'),
  RATE_LIMIT_WINDOW_MS: Joi.number().min(1000).default(60000).description('Rate limit window (ms) - alias'),
  RATE_LIMIT_MAX: Joi.number().min(1).default(100).description('Max requests per window'),
  RATE_LIMIT_MAX_REQUESTS: Joi.number().min(1).default(100).description('Max requests per window - alias'),

  // Monitoring configuration
  HEALTH_CHECK_ENABLED: Joi.boolean().default(true).description('Enable health checks'),
  METRICS_ENABLED: Joi.boolean().default(true).description('Enable metrics collection'),
  ENABLE_METRICS: Joi.boolean().default(true).description('Enable metrics (alias)'),
  PROMETHEUS_ENABLED: Joi.boolean().default(false).description('Enable Prometheus metrics'),
  ENABLE_AUDIT_LOG: Joi.boolean().default(true).description('Enable audit logging'),
  LOG_RETENTION_DAYS: Joi.number().min(1).max(365).default(90).description('Log retention (days)'),

  // CA Integration
  CA_URL: Joi.string().uri().description('CA service URL'),
  CA_SERVICE_URL: Joi.string().uri().required().description('CA service URL'),
  FORGE_CERT_SERIAL: Joi.string().description('Forge certificate serial'),
  FORGE_PRIVATE_KEY_PATH: Joi.string().description('Forge private key path'),
  FORGE_CERTIFICATE_PATH: Joi.string().description('Forge certificate path'),
  CA_ROOT_CERT_PATH: Joi.string().description('CA root certificate path'),
  OCSP_RESPONDER_URL: Joi.string().uri().description('OCSP responder URL'),

  // Feature Toggles
  ENABLE_GROUPWARE: Joi.boolean().default(true).description('Enable Groupware module'),
  ENABLE_CRM: Joi.boolean().default(true).description('Enable CRM module'),
  ENABLE_ERP: Joi.boolean().default(true).description('Enable ERP module'),
  ENABLE_WORKFLOWS: Joi.boolean().default(true).description('Enable Workflows'),
  ENABLE_REPORTING: Joi.boolean().default(true).description('Enable Reporting'),
  ENABLE_API: Joi.boolean().default(true).description('Enable API'),

  // ═══════════════════════════════════════════════════════════
  // FILE STORAGE & SHARING
  // ═══════════════════════════════════════════════════════════

  // Storage Backend Configuration
  STORAGE_TYPE: Joi.string().valid('local', 'disk', 's3', 'ipfs', 'hybrid').default('local').description('Primary storage backend'),
  STORAGE_PATH: Joi.string().default('/var/forge/files').description('Local storage path'),
  MAX_FILE_SIZE: Joi.number().min(1024).default(104857600).description('Max file size (bytes)'),
  MAX_UPLOAD_CHUNK_SIZE: Joi.number().min(1024).default(10485760).description('Max upload chunk size (bytes)'),
  ALLOWED_FILE_TYPES: Joi.string().default('*').description('Allowed file types (comma-separated or *)'),
  MAX_VERSIONS_PER_FILE: Joi.number().min(1).max(1000).default(20).description('Max file versions to keep'),

  // S3 Storage Configuration
  S3_ENABLED: Joi.boolean().default(false).description('Enable S3 storage'),
  S3_BUCKET: Joi.string().when('S3_ENABLED', { is: true, then: Joi.required() }).description('S3 bucket name'),
  S3_REGION: Joi.string().when('S3_ENABLED', { is: true, then: Joi.required() }).description('S3 region'),
  S3_ACCESS_KEY: Joi.string().description('S3 access key ID'),
  S3_ACCESS_KEY_ID: Joi.string().description('S3 access key ID (alias)'),
  S3_SECRET_KEY: Joi.string().description('S3 secret access key'),
  S3_SECRET_ACCESS_KEY: Joi.string().description('S3 secret access key (alias)'),
  S3_ENDPOINT: Joi.string().uri().description('Custom S3 endpoint (for S3-compatible services)'),
  S3_PREFIX: Joi.string().default('forge/').description('S3 key prefix'),
  S3_USE_PATH_STYLE: Joi.boolean().default(false).description('Use path-style URLs'),
  S3_SIGNATURE_VERSION: Joi.string().valid('v2', 'v4').default('v4').description('S3 signature version'),
  S3_FORCE_PATH_STYLE: Joi.boolean().default(false).description('Force path style'),
  S3_ACL: Joi.string().valid('private', 'public-read', 'public-read-write', 'authenticated-read').default('private').description('S3 ACL'),

  // IPFS Storage Configuration
  IPFS_ENABLED: Joi.boolean().default(false).description('Enable IPFS storage'),
  IPFS_API_URL: Joi.string().uri().default('http://localhost:5001').description('IPFS API URL'),
  IPFS_GATEWAY_URL: Joi.string().uri().default('https://ipfs.io').description('IPFS gateway URL'),
  IPFS_PIN_ENABLED: Joi.boolean().default(true).description('Auto-pin files to IPFS'),
  IPFS_CLUSTER_ENABLED: Joi.boolean().default(false).description('Use IPFS Cluster'),
  IPFS_CLUSTER_URL: Joi.string().uri().description('IPFS Cluster API URL'),
  IPFS_PINNING_SERVICE: Joi.string().valid('local', 'pinata', 'web3storage', 'infura').default('local').description('IPFS pinning service'),
  IPFS_PINATA_JWT: Joi.string().when('IPFS_PINNING_SERVICE', { is: 'pinata', then: Joi.required() }).description('Pinata JWT token'),
  IPFS_WEB3STORAGE_TOKEN: Joi.string().when('IPFS_PINNING_SERVICE', { is: 'web3storage', then: Joi.required() }).description('Web3.Storage token'),

  // Local Disk Storage
  DISK_ENABLED: Joi.boolean().default(true).description('Enable local disk storage'),
  DISK_STORAGE_PATH: Joi.string().default('/var/forge/storage').description('Disk storage path'),
  DISK_MAX_SIZE: Joi.number().min(0).default(1099511627776).description('Max disk storage size (bytes)'),
  DISK_QUOTA_ENABLED: Joi.boolean().default(true).description('Enable disk quotas'),

  // Storage Features
  ENABLE_DEDUPLICATION: Joi.boolean().default(true).description('Enable file deduplication'),
  ENABLE_ENCRYPTION_AT_REST: Joi.boolean().default(true).description('Enable encryption at rest'),
  ENABLE_VIRUS_SCANNING: Joi.boolean().default(false).description('Enable virus scanning'),
  VIRUS_SCANNER_TYPE: Joi.string().valid('clamav', 'virustotal', 'metadefender').default('clamav').description('Virus scanner type'),
  CLAMAV_HOST: Joi.string().hostname().description('ClamAV daemon host'),
  CLAMAV_PORT: Joi.number().port().default(3310).description('ClamAV daemon port'),

  // ═══════════════════════════════════════════════════════════
  // WEBDAV CONFIGURATION
  // ═══════════════════════════════════════════════════════════

  WEBDAV_ENABLED: Joi.boolean().default(true).description('Enable WebDAV server'),
  WEBDAV_PATH: Joi.string().default('/webdav').description('WebDAV base path'),
  WEBDAV_PORT: Joi.number().port().description('Dedicated WebDAV port (optional)'),
  WEBDAV_AUTH_REQUIRED: Joi.boolean().default(true).description('Require authentication for WebDAV'),
  WEBDAV_DIGEST_AUTH: Joi.boolean().default(true).description('Enable digest authentication'),
  WEBDAV_LOCK_ENABLED: Joi.boolean().default(true).description('Enable WebDAV locking'),
  WEBDAV_LOCK_TIMEOUT: Joi.number().min(60).default(3600).description('WebDAV lock timeout (seconds)'),
  WEBDAV_MAX_FILE_SIZE: Joi.number().min(1024).default(104857600).description('WebDAV max file size (bytes)'),
  WEBDAV_QUOTA_ENABLED: Joi.boolean().default(true).description('Enable WebDAV quotas'),
  WEBDAV_DEFAULT_QUOTA: Joi.number().min(0).default(10737418240).description('Default WebDAV quota (bytes)'),
  WEBDAV_VERSIONING: Joi.boolean().default(true).description('Enable WebDAV versioning (DeltaV)'),
  WEBDAV_SEARCH_ENABLED: Joi.boolean().default(true).description('Enable WebDAV SEARCH (DASL)'),
  WEBDAV_CORS_ENABLED: Joi.boolean().default(true).description('Enable CORS for WebDAV'),

  // ═══════════════════════════════════════════════════════════
  // CALDAV & CARDDAV CONFIGURATION
  // ═══════════════════════════════════════════════════════════

  // CalDAV Configuration
  CALDAV_ENABLED: Joi.boolean().default(true).description('Enable CalDAV server'),
  CALDAV_PATH: Joi.string().default('/caldav').description('CalDAV base path'),
  CALDAV_URL: Joi.string().uri().description('Public CalDAV server URL'),
  CALDAV_PORT: Joi.number().port().description('Dedicated CalDAV port (optional)'),
  CALDAV_PRINCIPAL_PATH: Joi.string().default('/caldav/principals').description('CalDAV principal path'),
  CALDAV_CALENDAR_HOME: Joi.string().default('/caldav/calendars').description('CalDAV calendar home path'),
  CALDAV_AUTH_REQUIRED: Joi.boolean().default(true).description('Require authentication for CalDAV'),
  CALDAV_DIGEST_AUTH: Joi.boolean().default(true).description('Enable digest authentication'),
  CALDAV_TIMEZONE: Joi.string().default('UTC').description('Default CalDAV timezone'),
  CALDAV_MAX_RESOURCE_SIZE: Joi.number().min(1024).default(10485760).description('Max calendar resource size (bytes)'),
  CALDAV_MAX_INSTANCES: Joi.number().min(1).default(1000).description('Max instances per recurring event'),
  CALDAV_SCHEDULING_ENABLED: Joi.boolean().default(true).description('Enable CalDAV scheduling (iTIP)'),
  CALDAV_FREEBUSY_ENABLED: Joi.boolean().default(true).description('Enable free/busy lookups'),
  CALDAV_SYNC_TOKEN: Joi.boolean().default(true).description('Enable sync-token (RFC 6578)'),
  CALDAV_CALENDAR_PROXY: Joi.boolean().default(true).description('Enable calendar proxy support'),
  CALDAV_SUBSCRIPTIONS: Joi.boolean().default(true).description('Enable calendar subscriptions'),
  CALDAV_NOTIFICATIONS: Joi.boolean().default(true).description('Enable calendar notifications'),
  CALDAV_MANAGED_ATTACHMENTS: Joi.boolean().default(true).description('Enable managed attachments'),

  // CardDAV Configuration
  CARDDAV_ENABLED: Joi.boolean().default(true).description('Enable CardDAV server'),
  CARDDAV_PATH: Joi.string().default('/carddav').description('CardDAV base path'),
  CARDDAV_URL: Joi.string().uri().description('Public CardDAV server URL'),
  CARDDAV_PORT: Joi.number().port().description('Dedicated CardDAV port (optional)'),
  CARDDAV_PRINCIPAL_PATH: Joi.string().default('/carddav/principals').description('CardDAV principal path'),
  CARDDAV_ADDRESSBOOK_HOME: Joi.string().default('/carddav/addressbooks').description('CardDAV addressbook home path'),
  CARDDAV_AUTH_REQUIRED: Joi.boolean().default(true).description('Require authentication for CardDAV'),
  CARDDAV_DIGEST_AUTH: Joi.boolean().default(true).description('Enable digest authentication'),
  CARDDAV_MAX_RESOURCE_SIZE: Joi.number().min(1024).default(1048576).description('Max contact resource size (bytes)'),
  CARDDAV_SYNC_TOKEN: Joi.boolean().default(true).description('Enable sync-token (RFC 6578)'),
  CARDDAV_DIRECTORY_GATEWAY: Joi.boolean().default(true).description('Enable directory gateway'),
  CARDDAV_BULK_OPERATIONS: Joi.boolean().default(true).description('Enable bulk operations'),
  CARDDAV_PHOTO_SIZE_LIMIT: Joi.number().min(1024).default(5242880).description('Max photo size (bytes)'),

  // DAV Authentication & Security
  DAV_REALM: Joi.string().default('Exprsn Forge DAV').description('DAV authentication realm'),
  DAV_BEARER_AUTH: Joi.boolean().default(true).description('Enable Bearer token authentication'),
  DAV_OAUTH2_ENABLED: Joi.boolean().default(true).description('Enable OAuth2 for DAV'),
  DAV_TLS_REQUIRED: Joi.boolean().default(false).description('Require TLS for DAV connections'),
  DAV_RATE_LIMIT: Joi.number().min(0).default(1000).description('DAV requests per hour per user'),

  // ═══════════════════════════════════════════════════════════
  // GROUPWARE SETTINGS
  // ═══════════════════════════════════════════════════════════

  // Calendar Settings
  CALENDAR_MAX_EVENTS_PER_DAY: Joi.number().min(1).max(1000).default(50).description('Max events per day'),
  CALENDAR_DEFAULT_VIEW: Joi.string().valid('day', 'week', 'month', 'year', 'agenda').default('week').description('Default calendar view'),
  CALENDAR_WEEK_START: Joi.number().min(0).max(6).default(0).description('Week start day (0=Sunday)'),
  CALENDAR_BUSINESS_HOURS_START: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).default('09:00').description('Business hours start'),
  CALENDAR_BUSINESS_HOURS_END: Joi.string().pattern(/^([01]\d|2[0-3]):([0-5]\d)$/).default('17:00').description('Business hours end'),
  CALENDAR_SLOT_DURATION: Joi.number().min(5).max(120).default(30).description('Calendar slot duration (minutes)'),
  CALENDAR_ENABLE_REMINDERS: Joi.boolean().default(true).description('Enable event reminders'),
  CALENDAR_DEFAULT_REMINDER: Joi.number().min(0).default(15).description('Default reminder (minutes before)'),

  // Task Management
  TASK_MAX_SUBTASK_DEPTH: Joi.number().min(1).max(10).default(5).description('Max subtask nesting depth'),
  TASK_ENABLE_DEPENDENCIES: Joi.boolean().default(true).description('Enable task dependencies'),
  TASK_ENABLE_TIME_TRACKING: Joi.boolean().default(true).description('Enable time tracking'),
  TASK_ENABLE_ESTIMATES: Joi.boolean().default(true).description('Enable time estimates'),
  TASK_DEFAULT_PRIORITY: Joi.string().valid('low', 'medium', 'high', 'urgent').default('medium').description('Default task priority'),
  TASK_AUTO_CLOSE_SUBTASKS: Joi.boolean().default(false).description('Auto-close subtasks when parent closes'),

  // Document Management
  DOCUMENT_VERSION_LIMIT: Joi.number().min(1).max(1000).default(20).description('Max document versions'),
  DOCUMENT_AUTO_SAVE: Joi.boolean().default(true).description('Enable auto-save'),
  DOCUMENT_AUTO_SAVE_INTERVAL: Joi.number().min(10000).default(60000).description('Auto-save interval (ms)'),
  DOCUMENT_ENABLE_COMMENTS: Joi.boolean().default(true).description('Enable document comments'),
  DOCUMENT_ENABLE_TEMPLATES: Joi.boolean().default(true).description('Enable document templates'),
  DOCUMENT_OCR_ENABLED: Joi.boolean().default(false).description('Enable OCR for scanned documents'),
  DOCUMENT_PREVIEW_ENABLED: Joi.boolean().default(true).description('Enable document preview'),
  DOCUMENT_COLLABORATIVE_EDITING: Joi.boolean().default(true).description('Enable collaborative editing'),

  // Wiki Settings
  WIKI_ENABLED: Joi.boolean().default(true).description('Enable wiki'),
  WIKI_MAX_PAGE_SIZE: Joi.number().min(1024).default(1048576).description('Max wiki page size (bytes)'),
  WIKI_MARKDOWN_ENABLED: Joi.boolean().default(true).description('Enable Markdown'),
  WIKI_WYSIWYG_EDITOR: Joi.boolean().default(true).description('Enable WYSIWYG editor'),
  WIKI_PAGE_HISTORY: Joi.boolean().default(true).description('Enable page history'),
  WIKI_MAX_HISTORY_VERSIONS: Joi.number().min(1).max(1000).default(100).description('Max history versions'),
  WIKI_ENABLE_ATTACHMENTS: Joi.boolean().default(true).description('Enable attachments'),
  WIKI_ENABLE_COMMENTS: Joi.boolean().default(true).description('Enable comments'),
  WIKI_ENABLE_TAGS: Joi.boolean().default(true).description('Enable tags'),

  // Email Integration
  EMAIL_PROVIDER: Joi.string().valid('smtp', 'sendgrid', 'ses', 'mailgun', 'postmark').default('smtp').description('Email provider'),
  SMTP_HOST: Joi.string().hostname().description('SMTP host'),
  SMTP_PORT: Joi.number().port().default(587).description('SMTP port'),
  SMTP_SECURE: Joi.boolean().default(false).description('Use TLS'),
  SMTP_USER: Joi.string().description('SMTP username'),
  SMTP_PASSWORD: Joi.string().description('SMTP password'),
  SMTP_FROM: Joi.string().email().description('From email address'),
  SENDGRID_API_KEY: Joi.string().when('EMAIL_PROVIDER', { is: 'sendgrid', then: Joi.required() }).description('SendGrid API key'),
  AWS_SES_REGION: Joi.string().when('EMAIL_PROVIDER', { is: 'ses', then: Joi.required() }).description('AWS SES region'),
  AWS_SES_ACCESS_KEY_ID: Joi.string().description('AWS SES access key'),
  AWS_SES_SECRET_ACCESS_KEY: Joi.string().description('AWS SES secret key'),

  // ═══════════════════════════════════════════════════════════
  // CRM SETTINGS
  // ═══════════════════════════════════════════════════════════

  LEAD_SCORING_ENABLED: Joi.boolean().default(true).description('Enable lead scoring'),
  LEAD_SCORING_MODEL: Joi.string().valid('simple', 'weighted', 'ml').default('weighted').description('Lead scoring model'),
  AUTO_ASSIGN_LEADS: Joi.boolean().default(true).description('Auto-assign leads'),
  LEAD_ASSIGNMENT_STRATEGY: Joi.string().valid('round-robin', 'territory', 'load-balanced', 'manual').default('round-robin').description('Lead assignment strategy'),
  DUPLICATE_DETECTION: Joi.boolean().default(true).description('Enable duplicate detection'),
  DUPLICATE_DETECTION_FIELDS: Joi.string().default('email,phone').description('Fields for duplicate detection'),
  CONTACT_MERGE_ENABLED: Joi.boolean().default(true).description('Enable contact merging'),
  ENABLE_TERRITORIES: Joi.boolean().default(true).description('Enable sales territories'),
  ENABLE_FORECASTING: Joi.boolean().default(true).description('Enable sales forecasting'),
  FORECAST_PERIOD: Joi.string().valid('monthly', 'quarterly', 'annually').default('quarterly').description('Forecast period'),
  PIPELINE_STAGES_CUSTOM: Joi.boolean().default(true).description('Allow custom pipeline stages'),
  DEFAULT_PIPELINE_STAGES: Joi.string().default('Lead,Qualified,Proposal,Negotiation,Closed Won,Closed Lost').description('Default pipeline stages'),
  OPPORTUNITY_PROBABILITY_AUTO: Joi.boolean().default(true).description('Auto-calculate win probability'),
  EMAIL_TRACKING_ENABLED: Joi.boolean().default(true).description('Enable email tracking'),
  EMAIL_TEMPLATE_VARIABLES: Joi.boolean().default(true).description('Enable template variables'),
  QUOTE_VERSIONING: Joi.boolean().default(true).description('Enable quote versioning'),
  QUOTE_EXPIRY_DAYS: Joi.number().min(1).max(365).default(30).description('Quote expiry (days)'),

  // ═══════════════════════════════════════════════════════════
  // ERP SETTINGS
  // ═══════════════════════════════════════════════════════════

  // Financial Settings
  MULTI_CURRENCY: Joi.boolean().default(true).description('Enable multi-currency'),
  DEFAULT_CURRENCY: Joi.string().length(3).uppercase().default('USD').description('Default currency code'),
  CURRENCY_AUTO_UPDATE: Joi.boolean().default(true).description('Auto-update exchange rates'),
  CURRENCY_API: Joi.string().valid('fixer', 'openexchangerates', 'currencylayer', 'ecb').default('fixer').description('Currency exchange rate API'),
  CURRENCY_API_KEY: Joi.string().description('Currency API key'),
  FISCAL_YEAR_START: Joi.string().pattern(/^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/).default('01-01').description('Fiscal year start (MM-DD)'),
  TAX_CALCULATION: Joi.boolean().default(true).description('Enable tax calculation'),
  DEFAULT_TAX_RATE: Joi.number().min(0).max(1).default(0.00).description('Default tax rate (decimal)'),
  TAX_INCLUSIVE_PRICING: Joi.boolean().default(false).description('Prices include tax'),
  MULTI_TAX_ENABLED: Joi.boolean().default(true).description('Enable multiple tax rates'),
  CHART_OF_ACCOUNTS_TEMPLATE: Joi.string().valid('standard', 'manufacturing', 'retail', 'services', 'nonprofit').default('standard').description('Chart of accounts template'),
  ENABLE_BUDGETING: Joi.boolean().default(true).description('Enable budgeting'),
  ENABLE_COST_CENTERS: Joi.boolean().default(true).description('Enable cost centers'),
  ENABLE_PROJECTS_ACCOUNTING: Joi.boolean().default(true).description('Enable project accounting'),

  // Inventory Settings
  INVENTORY_TRACKING: Joi.boolean().default(true).description('Enable inventory tracking'),
  INVENTORY_METHOD: Joi.string().valid('fifo', 'lifo', 'average', 'specific').default('fifo').description('Inventory valuation method'),
  SERIAL_NUMBER_TRACKING: Joi.boolean().default(false).description('Track serial numbers'),
  BATCH_LOT_TRACKING: Joi.boolean().default(true).description('Track batch/lot numbers'),
  EXPIRY_DATE_TRACKING: Joi.boolean().default(true).description('Track expiry dates'),
  MULTI_LOCATION: Joi.boolean().default(true).description('Enable multi-location inventory'),
  DEFAULT_LOCATION: Joi.string().default('main').description('Default location'),
  STOCK_ALERTS_ENABLED: Joi.boolean().default(true).description('Enable low stock alerts'),
  REORDER_POINT_AUTO: Joi.boolean().default(true).description('Auto-calculate reorder points'),
  ENABLE_WAREHOUSING: Joi.boolean().default(true).description('Enable warehouse management'),
  BARCODE_SCANNING: Joi.boolean().default(true).description('Enable barcode scanning'),
  BARCODE_FORMAT: Joi.string().valid('EAN13', 'UPC', 'CODE128', 'QR').default('CODE128').description('Barcode format'),

  // Manufacturing Settings
  MANUFACTURING_ENABLED: Joi.boolean().default(false).description('Enable manufacturing module'),
  BOM_ENABLED: Joi.boolean().default(true).description('Enable Bill of Materials'),
  BOM_VERSIONING: Joi.boolean().default(true).description('Enable BOM versioning'),
  WORK_ORDER_ENABLED: Joi.boolean().default(true).description('Enable work orders'),
  ROUTING_ENABLED: Joi.boolean().default(true).description('Enable routing'),
  CAPACITY_PLANNING: Joi.boolean().default(true).description('Enable capacity planning'),
  QUALITY_CONTROL: Joi.boolean().default(true).description('Enable quality control'),
  MRP_ENABLED: Joi.boolean().default(false).description('Enable MRP'),

  // Procurement Settings
  PURCHASE_APPROVAL_WORKFLOW: Joi.boolean().default(true).description('Enable purchase approval'),
  PURCHASE_APPROVAL_THRESHOLD: Joi.number().min(0).default(1000).description('Approval threshold amount'),
  VENDOR_PORTAL_ENABLED: Joi.boolean().default(true).description('Enable vendor portal'),
  RFQ_ENABLED: Joi.boolean().default(true).description('Enable RFQ/RFP'),
  DROP_SHIPPING: Joi.boolean().default(true).description('Enable drop shipping'),
  BLANKET_ORDERS: Joi.boolean().default(true).description('Enable blanket purchase orders'),

  // ═══════════════════════════════════════════════════════════
  // WORKFLOW SETTINGS
  // ═══════════════════════════════════════════════════════════

  MAX_WORKFLOW_STEPS: Joi.number().min(1).max(500).default(50).description('Max workflow steps'),
  WORKFLOW_TIMEOUT: Joi.number().min(1000).default(300000).description('Workflow timeout (ms)'),
  ENABLE_SCHEDULED_WORKFLOWS: Joi.boolean().default(true).description('Enable scheduled workflows'),
  WORKFLOW_EXECUTION_MODE: Joi.string().valid('sync', 'async', 'hybrid').default('async').description('Workflow execution mode'),
  WORKFLOW_VERSIONING: Joi.boolean().default(true).description('Enable workflow versioning'),
  WORKFLOW_TESTING_MODE: Joi.boolean().default(true).description('Enable workflow testing mode'),
  WORKFLOW_AUDIT_LOG: Joi.boolean().default(true).description('Enable workflow audit log'),
  WORKFLOW_ERROR_HANDLING: Joi.string().valid('stop', 'continue', 'retry').default('retry').description('Error handling strategy'),
  WORKFLOW_RETRY_ATTEMPTS: Joi.number().min(0).max(10).default(3).description('Retry attempts'),
  WORKFLOW_RETRY_DELAY: Joi.number().min(1000).default(5000).description('Retry delay (ms)'),

  // ═══════════════════════════════════════════════════════════
  // REPORTING SETTINGS
  // ═══════════════════════════════════════════════════════════

  REPORT_CACHE_TTL: Joi.number().min(0).default(3600).description('Report cache TTL (seconds)'),
  MAX_REPORT_ROWS: Joi.number().min(100).max(1000000).default(10000).description('Max report rows'),
  ENABLE_REPORT_EXPORT: Joi.boolean().default(true).description('Enable report export'),
  REPORT_EXPORT_FORMATS: Joi.string().default('pdf,xlsx,csv,html').description('Enabled export formats'),
  REPORT_SCHEDULING: Joi.boolean().default(true).description('Enable report scheduling'),
  REPORT_EMAIL_DELIVERY: Joi.boolean().default(true).description('Enable email delivery'),
  REPORT_BUILDER_ENABLED: Joi.boolean().default(true).description('Enable custom report builder'),
  REPORT_SQL_ALLOWED: Joi.boolean().default(false).description('Allow custom SQL in reports'),
  DASHBOARD_WIDGETS_MAX: Joi.number().min(1).max(100).default(20).description('Max dashboard widgets'),
  DASHBOARD_AUTO_REFRESH: Joi.boolean().default(true).description('Enable dashboard auto-refresh'),
  DASHBOARD_REFRESH_INTERVAL: Joi.number().min(10000).default(60000).description('Dashboard refresh interval (ms)'),

  // ═══════════════════════════════════════════════════════════
  // INTEGRATION SETTINGS
  // ═══════════════════════════════════════════════════════════

  // Service Integration URLs
  AUTH_SERVICE_URL: Joi.string().uri().description('Auth service URL'),
  TIMELINE_SERVICE_URL: Joi.string().uri().description('Timeline service URL'),
  NEXUS_SERVICE_URL: Joi.string().uri().description('Nexus service URL'),
  SPARK_SERVICE_URL: Joi.string().uri().description('Spark messaging service URL'),
  HERALD_SERVICE_URL: Joi.string().uri().description('Herald notification service URL'),
  FILEVAULT_SERVICE_URL: Joi.string().uri().description('FileVault service URL'),
  PULSE_SERVICE_URL: Joi.string().uri().description('Pulse analytics service URL'),

  // External Integrations
  GOOGLE_CALENDAR_ENABLED: Joi.boolean().default(false).description('Enable Google Calendar sync'),
  GOOGLE_CALENDAR_CLIENT_ID: Joi.string().description('Google Calendar OAuth client ID'),
  GOOGLE_CALENDAR_CLIENT_SECRET: Joi.string().description('Google Calendar OAuth secret'),
  GOOGLE_WORKSPACE_ENABLED: Joi.boolean().default(false).description('Enable Google Workspace integration'),

  MICROSOFT365_ENABLED: Joi.boolean().default(false).description('Enable Microsoft 365 integration'),
  MICROSOFT365_CLIENT_ID: Joi.string().description('Microsoft 365 client ID'),
  MICROSOFT365_CLIENT_SECRET: Joi.string().description('Microsoft 365 client secret'),
  MICROSOFT365_TENANT_ID: Joi.string().description('Microsoft 365 tenant ID'),

  QUICKBOOKS_ENABLED: Joi.boolean().default(false).description('Enable QuickBooks integration'),
  QUICKBOOKS_CLIENT_ID: Joi.string().description('QuickBooks client ID'),
  QUICKBOOKS_CLIENT_SECRET: Joi.string().description('QuickBooks client secret'),
  QUICKBOOKS_ENVIRONMENT: Joi.string().valid('sandbox', 'production').default('sandbox').description('QuickBooks environment'),

  XERO_ENABLED: Joi.boolean().default(false).description('Enable Xero integration'),
  XERO_CLIENT_ID: Joi.string().description('Xero client ID'),
  XERO_CLIENT_SECRET: Joi.string().description('Xero client secret'),

  STRIPE_ENABLED: Joi.boolean().default(false).description('Enable Stripe payments'),
  STRIPE_SECRET_KEY: Joi.string().description('Stripe secret key'),
  STRIPE_PUBLISHABLE_KEY: Joi.string().description('Stripe publishable key'),
  STRIPE_WEBHOOK_SECRET: Joi.string().description('Stripe webhook secret'),

  PAYPAL_ENABLED: Joi.boolean().default(false).description('Enable PayPal'),
  PAYPAL_CLIENT_ID: Joi.string().description('PayPal client ID'),
  PAYPAL_CLIENT_SECRET: Joi.string().description('PayPal client secret'),
  PAYPAL_MODE: Joi.string().valid('sandbox', 'live').default('sandbox').description('PayPal mode'),

  // Shipping Integrations
  SHIPPING_ENABLED: Joi.boolean().default(false).description('Enable shipping integrations'),
  FEDEX_ENABLED: Joi.boolean().default(false).description('Enable FedEx'),
  FEDEX_API_KEY: Joi.string().description('FedEx API key'),
  FEDEX_ACCOUNT_NUMBER: Joi.string().description('FedEx account number'),
  UPS_ENABLED: Joi.boolean().default(false).description('Enable UPS'),
  UPS_API_KEY: Joi.string().description('UPS API key'),
  UPS_ACCOUNT_NUMBER: Joi.string().description('UPS account number'),
  USPS_ENABLED: Joi.boolean().default(false).description('Enable USPS'),
  USPS_USER_ID: Joi.string().description('USPS user ID'),

  // ═══════════════════════════════════════════════════════════
  // BACKGROUND JOBS & SCHEDULING
  // ═══════════════════════════════════════════════════════════

  // Bull Queue Configuration
  BULL_REDIS_HOST: Joi.string().hostname().default('localhost').description('Bull Redis host'),
  BULL_REDIS_PORT: Joi.number().port().default(6379).description('Bull Redis port'),
  BULL_CONCURRENCY: Joi.number().min(1).max(100).default(5).description('Bull job concurrency'),

  // Scheduled Jobs
  ENABLE_CRON_JOBS: Joi.boolean().default(true).description('Enable cron jobs'),
  CRON_BACKUP_SCHEDULE: Joi.string().default('0 2 * * *').description('Backup cron schedule'),
  CRON_CLEANUP_SCHEDULE: Joi.string().default('0 3 * * *').description('Cleanup cron schedule'),
  CRON_REPORT_SCHEDULE: Joi.string().default('0 * * * *').description('Report generation schedule'),
  CRON_SYNC_SCHEDULE: Joi.string().default('*/15 * * * *').description('External sync schedule'),

  // ═══════════════════════════════════════════════════════════
  // SOCKET.IO CONFIGURATION
  // ═══════════════════════════════════════════════════════════

  SOCKET_IO_ENABLED: Joi.boolean().default(true).description('Enable Socket.IO'),
  SOCKETIO_ENABLED: Joi.boolean().default(true).description('Enable Socket.IO (alias)'),
  SOCKET_IO_PATH: Joi.string().default('/socket.io').description('Socket.IO path'),
  SOCKETIO_PATH: Joi.string().default('/socket.io').description('Socket.IO path (alias)'),
  SOCKET_IO_CORS_ORIGINS: Joi.string().default('*').description('Socket.IO CORS origins'),
  SOCKETIO_CORS_ORIGIN: Joi.string().default('*').description('Socket.IO CORS origin (alias)'),
  SOCKETIO_PING_TIMEOUT: Joi.number().min(1000).default(60000).description('Socket.IO ping timeout (ms)'),
  SOCKETIO_PING_INTERVAL: Joi.number().min(1000).default(25000).description('Socket.IO ping interval (ms)'),

  // ═══════════════════════════════════════════════════════════
  // DEVELOPMENT & DEBUGGING
  // ═══════════════════════════════════════════════════════════

  DEBUG: Joi.boolean().default(false).description('Enable debug mode'),
  ENABLE_SEED_DATA: Joi.boolean().default(false).description('Enable seed data on startup'),
  ENABLE_DEBUG_ROUTES: Joi.boolean().default(false).description('Enable debug routes')
}).options({ stripUnknown: true, abortEarly: false });

/**
 * Get schema for a specific service
 * @param {string} serviceId - Service identifier
 * @returns {Object|null} Joi schema or null if not found
 */
function getSchemaForService(serviceId) {
  const schemaMap = {
    'exprsn-ca': caConfigSchema,
    'exprsn-timeline': timelineConfigSchema,
    'exprsn-nexus': nexusConfigSchema,
    'exprsn-vault': vaultConfigSchema,
    'exprsn-forge': forgeConfigSchema
  };

  return schemaMap[serviceId] || null;
}

/**
 * Get all available schemas
 * @returns {Object} Map of service IDs to schemas
 */
function getAllSchemas() {
  return {
    'exprsn-ca': caConfigSchema,
    'exprsn-timeline': timelineConfigSchema,
    'exprsn-nexus': nexusConfigSchema,
    'exprsn-vault': vaultConfigSchema,
    'exprsn-forge': forgeConfigSchema
  };
}

module.exports = {
  commonSchemas,
  caConfigSchema,
  timelineConfigSchema,
  nexusConfigSchema,
  vaultConfigSchema,
  forgeConfigSchema,
  getSchemaForService,
  getAllSchemas
};
