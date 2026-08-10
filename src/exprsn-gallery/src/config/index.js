/**
 * ═══════════════════════════════════════════════════════════════════════
 * Gallery Service Configuration
 * ═══════════════════════════════════════════════════════════════════════
 */

require('dotenv').config();

module.exports = {
  // Service configuration
  service: {
    name: 'exprsn-gallery',
    port: process.env.GALLERY_SERVICE_PORT || 3008,
    host: process.env.GALLERY_SERVICE_HOST || 'localhost',
    domain: process.env.GALLERY_CA_DOMAIN || 'gallery.exprsn.io',
    env: process.env.NODE_ENV || 'development'
  },

  // Database configuration
  database: {
    host: process.env.GALLERY_PG_HOST || 'localhost',
    port: parseInt(process.env.GALLERY_PG_PORT || '5432'),
    database: process.env.GALLERY_PG_DATABASE || 'exprsn_gallery',
    user: process.env.GALLERY_PG_USER || 'postgres',
    password: process.env.GALLERY_PG_PASSWORD || '',
    pool: {
      max: parseInt(process.env.DB_POOL_MAX || '20'),
      min: parseInt(process.env.DB_POOL_MIN || '5'),
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000'),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000')
    }
  },

  // Redis configuration
  redis: {
    enabled: process.env.REDIS_ENABLED !== 'false',
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || null,
    db: parseInt(process.env.REDIS_DB || '0'),
    ttl: parseInt(process.env.REDIS_TTL || '3600') // 1 hour default
  },

  // CA Integration
  ca: {
    domain: process.env.GALLERY_CA_DOMAIN || 'gallery.exprsn.io',
    certificateSerial: process.env.GALLERY_CERT_SERIAL || '',
    privateKeyPath: process.env.GALLERY_PRIVATE_KEY_PATH || './keys/gallery-service-key.pem',
    certificatePath: process.env.GALLERY_CERTIFICATE_PATH || './keys/gallery-service-cert.pem',
    rootCertPath: process.env.CA_ROOT_CERT_PATH || './keys/ca-root-cert.pem',
    caServiceUrl: process.env.CA_SERVICE_URL || 'http://localhost:3000'
  },

  // FileVault integration
  filevault: {
    enabled: process.env.FILEVAULT_ENABLED !== 'false',
    serviceUrl: process.env.FILEVAULT_SERVICE_URL || 'http://localhost:3007'
  },

  // Timeline integration
  timeline: {
    enabled: process.env.TIMELINE_ENABLED !== 'false',
    serviceUrl: process.env.TIMELINE_SERVICE_URL || 'http://localhost:3004'
  },

  // CDN configuration
  cdn: {
    enabled: process.env.CDN_ENABLED === 'true',
    endpoint: process.env.CDN_ENDPOINT || 'https://cdn.exprsn.io',
    region: process.env.CDN_REGION || 'global',
    signedUrls: process.env.CDN_SIGNED_URLS === 'true',
    signedUrlTtl: parseInt(process.env.CDN_SIGNED_URL_TTL || '3600')
  },

  // Media processing
  media: {
    // Image settings
    imageMaxSize: parseInt(process.env.IMAGE_MAX_SIZE || '104857600'), // 100MB
    thumbnailSizes: (process.env.THUMBNAIL_SIZES || '150,400,1024,2048')
      .split(',')
      .map(s => parseInt(s)),
    imageFormats: ['jpeg', 'jpg', 'png', 'gif', 'webp', 'heif', 'heic'],

    // Video settings
    videoMaxSize: parseInt(process.env.VIDEO_MAX_SIZE || '2147483648'), // 2GB
    videoBitrates: (process.env.VIDEO_BITRATES || '360,480,720,1080')
      .split(',')
      .map(b => parseInt(b)),
    videoFormats: (process.env.VIDEO_FORMAT || 'hls,dash').split(','),

    // Processing features
    enableFaceDetection: process.env.ENABLE_FACE_DETECTION === 'true',
    enableAutoTagging: process.env.ENABLE_AUTO_TAGGING === 'true',

    // Storage backend
    storageBackend: process.env.STORAGE_BACKEND || 'local', // local, s3, filevault
    localStoragePath: process.env.LOCAL_STORAGE_PATH || './storage',

    // S3 configuration (if using S3 backend)
    s3: {
      bucket: process.env.S3_BUCKET || '',
      region: process.env.S3_REGION || 'us-east-1',
      accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
    }
  },

  // Upload settings
  upload: {
    tempDir: process.env.UPLOAD_TEMP_DIR || './tmp/uploads',
    maxFileSize: parseInt(process.env.UPLOAD_MAX_FILE_SIZE || '2147483648'), // 2GB
    allowedMimeTypes: [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/heif',
      'image/heic',
      // Videos
      'video/mp4',
      'video/quicktime',
      'video/x-msvideo',
      'video/x-matroska',
      'video/webm'
    ]
  },

  // Security
  security: {
    sessionSecret: process.env.SESSION_SECRET || 'change-this-secret',
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || '10'),
    maxLoginAttempts: parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5'),
    lockoutDuration: parseInt(process.env.LOCKOUT_DURATION || '900000') // 15 minutes
  },

  // Rate limiting
  rateLimit: {
    enabled: process.env.RATE_LIMIT_ENABLED !== 'false',
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'), // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX || '100'), // Max requests per window
    uploadMax: parseInt(process.env.RATE_LIMIT_UPLOAD_MAX || '10') // Max uploads per window
  },

  // CORS
  cors: {
    enabled: process.env.CORS_ENABLED !== 'false',
    origin: process.env.CORS_ORIGIN || '*',
    credentials: process.env.CORS_CREDENTIALS === 'true'
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json',
    dir: process.env.LOG_DIR || './logs',
    maxFiles: parseInt(process.env.LOG_MAX_FILES || '14'),
    maxSize: process.env.LOG_MAX_SIZE || '20m'
  },

  // Bull queue (for background jobs)
  queue: {
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD || null
    },
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000
      },
      removeOnComplete: true,
      removeOnFail: false
    }
  }
};
