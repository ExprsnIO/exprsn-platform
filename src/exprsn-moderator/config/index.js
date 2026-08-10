/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Moderator - Configuration Management
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();

const config = {
  // Service Configuration
  service: {
    name: 'exprsn-moderator',
    version: '1.0.0',
    port: process.env.MODERATOR_SERVICE_PORT || 3006,
    host: process.env.MODERATOR_SERVICE_HOST || 'moderator.exprsn.io',
    env: process.env.NODE_ENV || 'development'
  },

  // Database Configuration
  database: {
    host: process.env.MODERATOR_PG_HOST || 'localhost',
    port: parseInt(process.env.MODERATOR_PG_PORT) || 5432,
    database: process.env.MODERATOR_PG_DATABASE || 'exprsn_moderator',
    username: process.env.MODERATOR_PG_USER || 'moderator_service',
    password: process.env.MODERATOR_PG_PASSWORD,
    dialect: 'postgres',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 20,
      min: parseInt(process.env.DB_POOL_MIN) || 5,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
      idle: parseInt(process.env.DB_POOL_IDLE) || 10000
    }
  },

  // Redis Configuration
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB) || 3,
    keyPrefix: 'moderator:'
  },

  // Certificate Authority Integration
  ca: {
    domain: process.env.MODERATOR_CA_DOMAIN || 'moderator.exprsn.io',
    certificateSerial: process.env.MODERATOR_CERT_SERIAL,
    privateKeyPath: process.env.MODERATOR_PRIVATE_KEY_PATH || './certs/moderator-key.pem',
    certificatePath: process.env.MODERATOR_CERTIFICATE_PATH || './certs/moderator-cert.pem',
    rootCertPath: process.env.CA_ROOT_CERT_PATH || './certs/ca-root.pem',
    caServiceUrl: process.env.CA_SERVICE_URL || 'http://localhost:3000'
  },

  // AI Services Configuration
  ai: {
    // Anthropic Claude
    claude: {
      enabled: process.env.CLAUDE_ENABLED === 'true',
      apiKey: process.env.CLAUDE_API_KEY,
      model: process.env.CLAUDE_MODEL || 'claude-3-5-sonnet-20241022',
      maxTokens: parseInt(process.env.CLAUDE_MAX_TOKENS) || 4096,
      temperature: parseFloat(process.env.CLAUDE_TEMPERATURE) || 0.3
    },

    // OpenAI
    openai: {
      enabled: process.env.OPENAI_ENABLED === 'true',
      apiKey: process.env.OPENAI_API_KEY,
      model: process.env.OPENAI_MODEL || 'gpt-4-turbo-preview',
      moderationModel: process.env.OPENAI_MODERATION_MODEL || 'text-moderation-latest',
      visionModel: process.env.OPENAI_VISION_MODEL || 'gpt-4-vision-preview',
      maxTokens: parseInt(process.env.OPENAI_MAX_TOKENS) || 4096
    },

    // Local ML Models (optional)
    local: {
      enabled: process.env.LOCAL_ML_ENABLED === 'true',
      nsfwModelPath: process.env.NSFW_MODEL_PATH,
      toxicityModelPath: process.env.TOXICITY_MODEL_PATH,
      spamModelPath: process.env.SPAM_MODEL_PATH
    }
  },

  // Classification Thresholds
  moderation: {
    thresholds: {
      autoApprove: parseInt(process.env.AUTO_APPROVE_THRESHOLD) || 30,
      manualReview: parseInt(process.env.MANUAL_REVIEW_THRESHOLD) || 51,
      autoReject: parseInt(process.env.AUTO_REJECT_THRESHOLD) || 91
    },

    // Risk Level Definitions
    riskLevels: {
      SAFE: { min: 0, max: 30, action: 'auto_approve', review: false },
      LOW_RISK: { min: 31, max: 50, action: 'approve_with_warning', review: false },
      MEDIUM_RISK: { min: 51, max: 75, action: 'queue_for_review', review: true },
      HIGH_RISK: { min: 76, max: 90, action: 'hide_pending_review', review: true },
      CRITICAL: { min: 91, max: 100, action: 'auto_reject', review: true, escalate: true }
    },

    // Feature Flags
    features: {
      autoModeration: process.env.ENABLE_AUTO_MODERATION !== 'false',
      manualReview: process.env.ENABLE_MANUAL_REVIEW !== 'false',
      appealSystem: process.env.ENABLE_APPEALS !== 'false',
      userReporting: process.env.ENABLE_USER_REPORTS !== 'false'
    },

    // Queue Configuration
    queue: {
      maxSize: parseInt(process.env.MAX_REVIEW_QUEUE_SIZE) || 10000,
      priorityWeights: {
        CRITICAL: 100,
        HIGH_RISK: 75,
        MEDIUM_RISK: 50,
        USER_REPORT: 60
      }
    },

    // Action Configuration
    actions: {
      warn: { enabled: true, maxWarnings: 3 },
      hide: { enabled: true, requiresReview: true },
      remove: { enabled: true, requiresModeratorApproval: true },
      suspend: { enabled: true, defaultDurationDays: 7 },
      ban: { enabled: true, requiresSeniorModeratorApproval: true }
    }
  },

  // Authorized Services
  authorizedServices: [
    'timeline.exprsn.io',
    'spark.exprsn.io',
    'gallery.exprsn.io',
    'live.exprsn.io',
    'filevault.exprsn.io'
  ],

  // Herald Service Configuration
  herald: {
    url: process.env.HERALD_SERVICE_URL || 'http://localhost:3014',
    enabled: process.env.HERALD_ENABLED !== 'false'
  },

  // Socket.io Configuration
  socket: {
    enabled: process.env.SOCKET_ENABLED !== 'false',
    port: parseInt(process.env.SOCKET_PORT) || 3007,
    cors: {
      origin: process.env.SOCKET_CORS_ORIGIN || '*',
      methods: ['GET', 'POST']
    },
    // Event namespaces
    namespaces: {
      moderation: '/moderation',
      notifications: '/notifications'
    }
  },

  // Rate Limiting
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // requests per window
    standardHeaders: true,
    legacyHeaders: false
  },

  // Logging Configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    file: {
      enabled: process.env.LOG_FILE_ENABLED !== 'false',
      path: process.env.LOG_FILE_PATH || './logs/moderator.log',
      maxSize: '20m',
      maxFiles: 10
    },
    console: {
      enabled: true,
      colorize: process.env.NODE_ENV === 'development'
    }
  },

  // Cache Configuration
  cache: {
    enabled: process.env.CACHE_ENABLED !== 'false',
    ttl: {
      classification: 300, // 5 minutes
      moderationStatus: 60, // 1 minute
      userWarnings: 3600, // 1 hour
      domainSettings: 600 // 10 minutes
    }
  }
};

module.exports = config;
