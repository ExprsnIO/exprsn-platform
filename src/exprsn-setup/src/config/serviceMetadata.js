/**
 * ═══════════════════════════════════════════════════════════════════════
 * Service Metadata Configuration
 * Complete metadata for all 18 Exprsn services
 * Used by the setup wizard to provide detailed configuration guidance
 * ═══════════════════════════════════════════════════════════════════════
 */

const serviceMetadata = {
  ca: {
    serviceId: 'ca',
    serviceName: 'Certificate Authority',
    version: '1.0.0',
    port: 3000,
    additionalPorts: [{ port: 2560, description: 'OCSP Responder' }],
    status: 'production',
    category: 'core',
    icon: 'shield-lock',
    color: '#DC382D',
    description: 'X.509 Certificate Authority with OCSP and CRL support. Provides cryptographic identity and CA token generation for all services.',
    dependencies: [],
    database: {
      enabled: true,
      name: 'exprsn_ca',
      tables: ['users', 'roles', 'groups', 'certificates', 'certificate_chains', 'ca_tokens', 'token_permissions', 'ocsp_responses', 'crl_lists', 'audit_logs', 'sessions'],
      migrations: 15
    },
    redis: {
      enabled: true,
      prefix: 'ca:',
      keyPatterns: [
        { pattern: 'ca:token:[token_id]', description: 'Token cache', ttl: '1h' },
        { pattern: 'ca:cert:[cert_serial]', description: 'Certificate cache', ttl: '24h' },
        { pattern: 'ca:ocsp:[cert_serial]', description: 'OCSP response cache', ttl: '1h' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/ca/initialize', description: 'Initialize CA' },
      { method: 'GET', path: '/api/certificates', description: 'List certificates' },
      { method: 'POST', path: '/api/certificates', description: 'Create certificate' },
      { method: 'POST', path: '/api/tokens', description: 'Generate CA token' },
      { method: 'POST', path: '/api/tokens/validate', description: 'Validate CA token' },
      { method: 'GET', path: '/api/ocsp/:serial', description: 'OCSP check' },
      { method: 'GET', path: '/api/crl', description: 'Get CRL' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment (development|production|test)' },
        { key: 'PORT', default: '3000', required: true, description: 'Service port' },
        { key: 'HOST', default: 'localhost', required: false, description: 'Service host' }
      ],
      database: [
        { key: 'DB_HOST', default: 'localhost', required: true, description: 'PostgreSQL host' },
        { key: 'DB_PORT', default: '5432', required: true, description: 'PostgreSQL port' },
        { key: 'DB_NAME', default: 'exprsn_ca', required: true, description: 'Database name' },
        { key: 'DB_USER', default: 'postgres', required: true, description: 'Database user' },
        { key: 'DB_PASSWORD', default: '', required: true, description: 'Database password', sensitive: true },
        { key: 'DB_SSL', default: 'false', required: false, description: 'Enable SSL connection' },
        { key: 'DB_POOL_MIN', default: '2', required: false, description: 'Minimum pool connections' },
        { key: 'DB_POOL_MAX', default: '10', required: false, description: 'Maximum pool connections' }
      ],
      redis: [
        { key: 'REDIS_ENABLED', default: 'true', required: false, description: 'Enable Redis caching' },
        { key: 'REDIS_HOST', default: 'localhost', required: false, description: 'Redis host' },
        { key: 'REDIS_PORT', default: '6379', required: false, description: 'Redis port' },
        { key: 'REDIS_PASSWORD', default: '', required: false, description: 'Redis password', sensitive: true },
        { key: 'REDIS_KEY_PREFIX', default: 'ca:', required: false, description: 'Redis key prefix' }
      ],
      security: [
        { key: 'SESSION_SECRET', default: '', required: true, description: 'Session secret key', sensitive: true, generate: true },
        { key: 'JWT_PRIVATE_KEY', default: '', required: true, description: 'JWT private key path' },
        { key: 'JWT_PUBLIC_KEY', default: '', required: true, description: 'JWT public key path' }
      ],
      ca: [
        { key: 'CA_NAME', default: 'Exprsn Root CA', required: true, description: 'CA name' },
        { key: 'CA_DOMAIN', default: 'localhost', required: true, description: 'CA domain' },
        { key: 'CA_COUNTRY', default: 'US', required: true, description: 'CA country code' },
        { key: 'CA_ROOT_VALIDITY_DAYS', default: '3650', required: false, description: 'Root CA validity (days)' },
        { key: 'OCSP_ENABLED', default: 'true', required: false, description: 'Enable OCSP responder' },
        { key: 'OCSP_PORT', default: '2560', required: false, description: 'OCSP responder port' },
        { key: 'CRL_ENABLED', default: 'true', required: false, description: 'Enable CRL generation' }
      ]
    },
    externalDependencies: [],
    features: [
      { key: 'OCSP_ENABLED', name: 'OCSP Responder', description: 'Online Certificate Status Protocol responder', default: true },
      { key: 'CRL_ENABLED', name: 'CRL Generation', description: 'Certificate Revocation List generation', default: true },
      { key: 'CLUSTER_ENABLED', name: 'Cluster Mode', description: 'Run in cluster mode with multiple workers', default: false }
    ],
    setupNotes: 'The CA service MUST be started first as all other services depend on it for authentication. Ensure PostgreSQL is running before setup.',
    resourceRequirements: {
      cpu: 'Low',
      memory: '256MB',
      storage: '1GB'
    }
  },

  auth: {
    serviceId: 'auth',
    serviceName: 'Authentication & SSO',
    version: '1.0.0',
    port: 3001,
    status: 'production',
    category: 'core',
    icon: 'person-lock',
    color: '#007bff',
    description: 'OAuth2/OIDC provider with SAML SSO and MFA support. Handles user authentication, authorization, and session management.',
    dependencies: ['ca'],
    database: {
      enabled: true,
      name: 'exprsn_auth',
      tables: ['users', 'user_profiles', 'oauth_clients', 'oauth_tokens', 'saml_providers', 'mfa_devices', 'sessions', 'audit_logs'],
      migrations: 12
    },
    redis: {
      enabled: true,
      prefix: 'auth:',
      keyPatterns: [
        { pattern: 'auth:session:[session_id]', description: 'Session data', ttl: '24h' },
        { pattern: 'auth:mfa:[user_id]', description: 'MFA temporary data', ttl: '5m' },
        { pattern: 'auth:oauth:[token]', description: 'OAuth token cache', ttl: '1h' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/auth/register', description: 'User registration' },
      { method: 'POST', path: '/api/auth/login', description: 'User login' },
      { method: 'POST', path: '/api/auth/logout', description: 'User logout' },
      { method: 'POST', path: '/api/mfa/enable', description: 'Enable MFA' },
      { method: 'POST', path: '/oauth/authorize', description: 'OAuth2 authorization' },
      { method: 'POST', path: '/oauth/token', description: 'OAuth2 token exchange' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'AUTH_SERVICE_PORT', default: '3001', required: true, description: 'Service port' }
      ],
      database: [
        { key: 'AUTH_DB_HOST', default: 'localhost', required: true, description: 'PostgreSQL host' },
        { key: 'AUTH_DB_PORT', default: '5432', required: true, description: 'PostgreSQL port' },
        { key: 'AUTH_DB_NAME', default: 'exprsn_auth', required: true, description: 'Database name' },
        { key: 'AUTH_DB_USER', default: 'postgres', required: true, description: 'Database user' },
        { key: 'AUTH_DB_PASSWORD', default: '', required: true, description: 'Database password', sensitive: true }
      ],
      redis: [
        { key: 'REDIS_ENABLED', default: 'true', required: false, description: 'Enable Redis' },
        { key: 'REDIS_HOST', default: 'localhost', required: false, description: 'Redis host' },
        { key: 'REDIS_PORT', default: '6379', required: false, description: 'Redis port' }
      ],
      ca: [
        { key: 'CA_URL', default: 'http://localhost:3000', required: true, description: 'CA service URL' },
        { key: 'CA_ROOT_CERT_PATH', default: '', required: true, description: 'CA root certificate path' }
      ],
      security: [
        { key: 'SESSION_SECRET', default: '', required: true, description: 'Session secret', sensitive: true, generate: true },
        { key: 'SESSION_LIFETIME', default: '86400000', required: false, description: 'Session lifetime (ms)' }
      ],
      oauth: [
        { key: 'GOOGLE_CLIENT_ID', default: '', required: false, description: 'Google OAuth client ID' },
        { key: 'GOOGLE_CLIENT_SECRET', default: '', required: false, description: 'Google OAuth client secret', sensitive: true },
        { key: 'GITHUB_CLIENT_ID', default: '', required: false, description: 'GitHub OAuth client ID' },
        { key: 'GITHUB_CLIENT_SECRET', default: '', required: false, description: 'GitHub OAuth client secret', sensitive: true }
      ]
    },
    externalDependencies: [
      { name: 'Google OAuth2', optional: true, description: 'Google social login' },
      { name: 'GitHub OAuth2', optional: true, description: 'GitHub social login' }
    ],
    features: [
      { key: 'REQUIRE_MFA', name: 'Require MFA', description: 'Require multi-factor authentication for all users', default: false },
      { key: 'GOOGLE_OAUTH_ENABLED', name: 'Google Login', description: 'Enable Google OAuth2 login', default: false },
      { key: 'GITHUB_OAUTH_ENABLED', name: 'GitHub Login', description: 'Enable GitHub OAuth2 login', default: false }
    ],
    setupNotes: 'Requires CA service to be running. Configure OAuth providers if social login is needed.',
    resourceRequirements: {
      cpu: 'Medium',
      memory: '512MB',
      storage: '2GB'
    }
  },

  timeline: {
    serviceId: 'timeline',
    serviceName: 'Social Timeline',
    version: '1.0.0',
    port: 3004,
    status: 'production',
    category: 'content',
    icon: 'rss',
    color: '#17a2b8',
    description: 'Social timeline with Bull queue processing. Manages posts, feeds, interactions, and content discovery.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_timeline',
      tables: ['posts', 'post_media', 'likes', 'comments', 'shares', 'bookmarks', 'user_follows', 'lists', 'notifications'],
      migrations: 18
    },
    redis: {
      enabled: true,
      prefix: 'timeline:',
      keyPatterns: [
        { pattern: 'timeline:user:[user_id]', description: 'User timeline cache', ttl: '15m' },
        { pattern: 'timeline:home:[user_id]', description: 'Home feed cache', ttl: '5m' },
        { pattern: 'timeline:trending', description: 'Trending content', ttl: '10m' }
      ]
    },
    apiEndpoints: [
      { method: 'GET', path: '/api/timeline', description: 'Get timeline feed' },
      { method: 'POST', path: '/api/posts', description: 'Create post' },
      { method: 'POST', path: '/api/posts/:id/like', description: 'Like post' },
      { method: 'POST', path: '/api/posts/:id/comment', description: 'Comment on post' },
      { method: 'GET', path: '/api/search', description: 'Search content' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'TIMELINE_SERVICE_PORT', default: '3004', required: true, description: 'Service port' }
      ],
      database: [
        { key: 'TIMELINE_DB_HOST', default: 'localhost', required: true, description: 'PostgreSQL host' },
        { key: 'TIMELINE_DB_PORT', default: '5432', required: true, description: 'PostgreSQL port' },
        { key: 'TIMELINE_DB_NAME', default: 'exprsn_timeline', required: true, description: 'Database name' },
        { key: 'TIMELINE_DB_USER', default: 'postgres', required: true, description: 'Database user' },
        { key: 'TIMELINE_DB_PASSWORD', default: '', required: true, description: 'Database password', sensitive: true }
      ],
      redis: [
        { key: 'REDIS_ENABLED', default: 'true', required: false, description: 'Enable Redis' },
        { key: 'REDIS_HOST', default: 'localhost', required: false, description: 'Redis host' },
        { key: 'REDIS_PORT', default: '6379', required: false, description: 'Redis port' }
      ],
      services: [
        { key: 'CA_URL', default: 'http://localhost:3000', required: true, description: 'CA service URL' },
        { key: 'HERALD_SERVICE_URL', default: 'http://localhost:3014', required: false, description: 'Herald service URL' },
        { key: 'PREFETCH_SERVICE_URL', default: 'http://localhost:3005', required: false, description: 'Prefetch service URL' }
      ],
      elasticsearch: [
        { key: 'ELASTICSEARCH_ENABLED', default: 'false', required: false, description: 'Enable Elasticsearch' },
        { key: 'ELASTICSEARCH_NODE', default: 'http://localhost:9200', required: false, description: 'Elasticsearch URL' }
      ]
    },
    externalDependencies: [
      { name: 'Elasticsearch', optional: true, description: 'Full-text search' }
    ],
    features: [
      { key: 'ENABLE_JOBS', name: 'Background Jobs', description: 'Enable Bull queue background jobs', default: true },
      { key: 'HERALD_ENABLED', name: 'Notifications', description: 'Enable Herald notifications', default: true },
      { key: 'ELASTICSEARCH_ENABLED', name: 'Search', description: 'Enable Elasticsearch search', default: false }
    ],
    setupNotes: 'Requires CA and Auth services. Optionally configure Elasticsearch for advanced search.',
    resourceRequirements: {
      cpu: 'High',
      memory: '1GB',
      storage: '10GB'
    }
  },

  // Add remaining 15 services with similar structure...
  // For brevity, I'll add a few more key services and then note the pattern

  herald: {
    serviceId: 'herald',
    serviceName: 'Notifications & Alerts',
    version: '1.0.0',
    port: 3014,
    status: 'production',
    category: 'communication',
    icon: 'bell',
    color: '#ffc107',
    description: 'Multi-channel notification delivery system supporting email, SMS, push notifications, and webhooks.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_herald',
      tables: ['notifications', 'notification_preferences', 'templates', 'delivery_logs'],
      migrations: 8
    },
    redis: {
      enabled: true,
      prefix: 'herald:',
      keyPatterns: [
        { pattern: 'herald:notification:[id]', description: 'Notification metadata', ttl: '1h' },
        { pattern: 'herald:preferences:[user_id]', description: 'User preferences cache', ttl: '24h' },
        { pattern: 'herald:queue:[channel]', description: 'Delivery queue', ttl: '1h' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/notifications', description: 'Send notification' },
      { method: 'GET', path: '/api/preferences/:userId', description: 'Get user preferences' },
      { method: 'PUT', path: '/api/templates/:id', description: 'Update template' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'HERALD_PORT', default: '3014', required: true, description: 'Service port' }
      ],
      database: [
        { key: 'DB_HOST', default: 'localhost', required: true, description: 'PostgreSQL host' },
        { key: 'DB_PORT', default: '5432', required: true, description: 'PostgreSQL port' },
        { key: 'DB_NAME', default: 'exprsn_herald', required: true, description: 'Database name' },
        { key: 'DB_USER', default: 'postgres', required: true, description: 'Database user' },
        { key: 'DB_PASSWORD', default: '', required: true, description: 'Database password', sensitive: true }
      ],
      email: [
        { key: 'EMAIL_PROVIDER', default: 'smtp', required: true, description: 'Email provider (smtp|sendgrid|ses)' },
        { key: 'SMTP_HOST', default: '', required: false, description: 'SMTP host' },
        { key: 'SMTP_PORT', default: '587', required: false, description: 'SMTP port' },
        { key: 'SMTP_USER', default: '', required: false, description: 'SMTP username' },
        { key: 'SMTP_PASSWORD', default: '', required: false, description: 'SMTP password', sensitive: true },
        { key: 'SENDGRID_API_KEY', default: '', required: false, description: 'SendGrid API key', sensitive: true }
      ],
      sms: [
        { key: 'SMS_PROVIDER', default: 'twilio', required: false, description: 'SMS provider (twilio)' },
        { key: 'TWILIO_ACCOUNT_SID', default: '', required: false, description: 'Twilio Account SID' },
        { key: 'TWILIO_AUTH_TOKEN', default: '', required: false, description: 'Twilio Auth Token', sensitive: true },
        { key: 'TWILIO_FROM_NUMBER', default: '', required: false, description: 'Twilio from number' }
      ],
      push: [
        { key: 'FCM_SERVER_KEY', default: '', required: false, description: 'Firebase Cloud Messaging key', sensitive: true },
        { key: 'APNS_KEY_PATH', default: '', required: false, description: 'Apple Push Notification Service key path' }
      ]
    },
    externalDependencies: [
      { name: 'SMTP Server / SendGrid / AWS SES', optional: false, description: 'Email delivery' },
      { name: 'Twilio', optional: true, description: 'SMS delivery' },
      { name: 'Firebase Cloud Messaging', optional: true, description: 'Push notifications (Android/Web)' },
      { name: 'Apple Push Notification Service', optional: true, description: 'Push notifications (iOS)' }
    ],
    features: [
      { key: 'FEATURE_EMAIL', name: 'Email Notifications', description: 'Enable email notifications', default: true },
      { key: 'FEATURE_SMS', name: 'SMS Notifications', description: 'Enable SMS notifications', default: false },
      { key: 'FEATURE_PUSH', name: 'Push Notifications', description: 'Enable push notifications', default: false },
      { key: 'FEATURE_DIGEST', name: 'Digest Mode', description: 'Enable notification digest/batching', default: true }
    ],
    setupNotes: 'Configure at least one notification channel (email, SMS, or push). SMTP/SendGrid required for email.',
    resourceRequirements: {
      cpu: 'Medium',
      memory: '512MB',
      storage: '2GB'
    }
  },

  spark: {
    serviceId: 'spark',
    serviceName: 'Real-time Messaging',
    version: '1.0.0',
    port: 3002,
    status: 'production',
    category: 'communication',
    icon: 'chat-dots',
    color: '#28a745',
    description: 'Real-time messaging with E2EE support. WebSocket-based chat with threads, reactions, and file attachments.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_spark',
      tables: ['conversations', 'messages', 'reactions', 'attachments', 'threads', 'typing_indicators'],
      migrations: 12
    },
    redis: {
      enabled: true,
      prefix: 'spark:',
      keyPatterns: [
        { pattern: 'spark:conversation:[id]', description: 'Conversation metadata', ttl: '1h' },
        { pattern: 'spark:presence:[user_id]', description: 'User presence status', ttl: '5m' },
        { pattern: 'spark:typing:[conversation_id]', description: 'Typing indicators', ttl: '10s' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/conversations', description: 'Create conversation' },
      { method: 'POST', path: '/api/messages', description: 'Send message' },
      { method: 'GET', path: '/api/search', description: 'Search messages' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'SPARK_SERVICE_PORT', default: '3002', required: true, description: 'Service port' }
      ],
      database: [
        { key: 'SPARK_DB_HOST', default: 'localhost', required: true, description: 'PostgreSQL host' },
        { key: 'SPARK_DB_NAME', default: 'exprsn_spark', required: true, description: 'Database name' }
      ],
      redis: [
        { key: 'REDIS_ENABLED', default: 'true', required: false, description: 'Enable Redis' },
        { key: 'REDIS_HOST', default: 'localhost', required: false, description: 'Redis host' }
      ],
      services: [
        { key: 'CA_URL', default: 'http://localhost:3000', required: true, description: 'CA service URL' },
        { key: 'FILEVAULT_SERVICE_URL', default: 'http://localhost:3007', required: false, description: 'FileVault URL' }
      ]
    },
    externalDependencies: [
      { name: 'Elasticsearch', optional: true, description: 'Message search' }
    ],
    features: [
      { key: 'ENABLE_THREADING', name: 'Message Threading', description: 'Enable threaded conversations', default: true },
      { key: 'ENABLE_SEARCH', name: 'Search', description: 'Enable message search', default: true }
    ],
    setupNotes: 'Requires CA and Auth services. Configure FileVault for file attachments.',
    resourceRequirements: { cpu: 'High', memory: '1GB', storage: '20GB' }
  },

  prefetch: {
    serviceId: 'prefetch',
    serviceName: 'Timeline Prefetching',
    version: '1.0.0',
    port: 3005,
    status: 'production',
    category: 'performance',
    icon: 'lightning',
    color: '#fd7e14',
    description: 'Timeline caching and prefetching service. Optimizes feed delivery with multi-tier caching.',
    dependencies: ['timeline'],
    database: {
      enabled: false,
      name: null,
      tables: [],
      migrations: 0
    },
    redis: {
      enabled: true,
      prefix: 'prefetch:',
      keyPatterns: [
        { pattern: 'prefetch:hot:[user_id]', description: 'Hot cache tier', ttl: '5m' },
        { pattern: 'prefetch:warm:[user_id]', description: 'Warm cache tier', ttl: '15m' }
      ]
    },
    apiEndpoints: [
      { method: 'GET', path: '/api/prefetch/:userId', description: 'Get prefetched timeline' },
      { method: 'POST', path: '/api/cache/invalidate', description: 'Invalidate cache' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'PREFETCH_SERVICE_PORT', default: '3005', required: true, description: 'Service port' }
      ],
      redis: [
        { key: 'REDIS_HOST', default: 'localhost', required: true, description: 'Redis host' },
        { key: 'REDIS_DB_HOT', default: '0', required: false, description: 'Hot cache Redis DB' },
        { key: 'REDIS_DB_WARM', default: '1', required: false, description: 'Warm cache Redis DB' }
      ],
      services: [
        { key: 'TIMELINE_SERVICE_URL', default: 'http://localhost:3004', required: true, description: 'Timeline service URL' }
      ],
      performance: [
        { key: 'HOT_CACHE_TTL', default: '300', required: false, description: 'Hot cache TTL (seconds)' },
        { key: 'PREFETCH_BATCH_SIZE', default: '50', required: false, description: 'Prefetch batch size' }
      ]
    },
    externalDependencies: [],
    features: [
      { key: 'ENABLE_PREDICTIVE', name: 'Predictive Prefetch', description: 'AI-based prefetching', default: true }
    ],
    setupNotes: 'Requires Timeline service. Redis is mandatory for this service.',
    resourceRequirements: { cpu: 'Medium', memory: '512MB', storage: '1GB' }
  },

  moderator: {
    serviceId: 'moderator',
    serviceName: 'Content Moderation',
    version: '1.0.0',
    port: 3006,
    status: 'production',
    category: 'safety',
    icon: 'shield-check',
    color: '#6f42c1',
    description: 'AI-powered content moderation using Claude and OpenAI for automated content review.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_moderator',
      tables: ['moderation_queue', 'decisions', 'reports', 'appeals', 'ban_rules'],
      migrations: 10
    },
    redis: {
      enabled: true,
      prefix: 'moderator:',
      keyPatterns: [
        { pattern: 'moderator:queue:[id]', description: 'Queue items', ttl: '1h' },
        { pattern: 'moderator:decision:[content_id]', description: 'Cached decisions', ttl: '24h' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/moderate', description: 'Moderate content' },
      { method: 'GET', path: '/api/queue', description: 'Get moderation queue' },
      { method: 'POST', path: '/api/appeals', description: 'Submit appeal' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'MODERATOR_SERVICE_PORT', default: '3006', required: true, description: 'Service port' }
      ],
      database: [
        { key: 'MODERATOR_PG_HOST', default: 'localhost', required: true, description: 'PostgreSQL host' },
        { key: 'MODERATOR_PG_DATABASE', default: 'exprsn_moderator', required: true, description: 'Database name' }
      ],
      ai: [
        { key: 'CLAUDE_ENABLED', default: 'false', required: false, description: 'Enable Claude AI' },
        { key: 'CLAUDE_API_KEY', default: '', required: false, description: 'Claude API key', sensitive: true },
        { key: 'OPENAI_ENABLED', default: 'false', required: false, description: 'Enable OpenAI' },
        { key: 'OPENAI_API_KEY', default: '', required: false, description: 'OpenAI API key', sensitive: true }
      ]
    },
    externalDependencies: [
      { name: 'Anthropic Claude API', optional: true, description: 'AI content moderation' },
      { name: 'OpenAI API', optional: true, description: 'AI content moderation' }
    ],
    features: [
      { key: 'ENABLE_AUTO_MODERATION', name: 'Auto Moderation', description: 'Automatic content moderation', default: true },
      { key: 'ENABLE_APPEALS', name: 'Appeals System', description: 'Allow moderation appeals', default: true }
    ],
    setupNotes: 'Configure at least one AI provider (Claude or OpenAI) for automated moderation.',
    resourceRequirements: { cpu: 'High', memory: '1GB', storage: '5GB' }
  },

  filevault: {
    serviceId: 'filevault',
    serviceName: 'File Storage',
    version: '1.0.0',
    port: 3007,
    status: 'production',
    category: 'storage',
    icon: 'folder',
    color: '#20c997',
    description: 'File storage with S3/Disk/IPFS backends. Supports deduplication and encryption at rest.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_filevault',
      tables: ['files', 'file_versions', 'folders', 'shares', 'access_logs'],
      migrations: 8
    },
    redis: {
      enabled: true,
      prefix: 'filevault:',
      keyPatterns: [
        { pattern: 'filevault:file:[file_id]', description: 'File metadata cache', ttl: '1h' },
        { pattern: 'filevault:upload:[upload_id]', description: 'Upload session', ttl: '1h' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/upload', description: 'Upload file' },
      { method: 'GET', path: '/api/download/:fileId', description: 'Download file' },
      { method: 'POST', path: '/api/shares', description: 'Create share link' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'FILEVAULT_SERVICE_PORT', default: '3007', required: true, description: 'Service port' }
      ],
      storage: [
        { key: 'DEFAULT_STORAGE_BACKEND', default: 'disk', required: true, description: 'Storage backend (disk|s3|ipfs)' },
        { key: 'S3_BUCKET', default: '', required: false, description: 'S3 bucket name' },
        { key: 'S3_ACCESS_KEY', default: '', required: false, description: 'S3 access key', sensitive: true },
        { key: 'S3_SECRET_KEY', default: '', required: false, description: 'S3 secret key', sensitive: true },
        { key: 'IPFS_API_URL', default: '', required: false, description: 'IPFS API URL' }
      ],
      limits: [
        { key: 'MAX_FILE_SIZE', default: '104857600', required: false, description: 'Max file size (bytes)' }
      ]
    },
    externalDependencies: [
      { name: 'AWS S3', optional: true, description: 'Cloud storage backend' },
      { name: 'IPFS', optional: true, description: 'Distributed storage backend' }
    ],
    features: [
      { key: 'ENABLE_DEDUPLICATION', name: 'Deduplication', description: 'File deduplication', default: true },
      { key: 'ENABLE_ENCRYPTION_AT_REST', name: 'Encryption', description: 'Encrypt files at rest', default: false }
    ],
    setupNotes: 'Default storage is local disk. Configure S3 or IPFS for distributed storage.',
    resourceRequirements: { cpu: 'Medium', memory: '512MB', storage: '100GB+' }
  },

  gallery: {
    serviceId: 'gallery',
    serviceName: 'Media Galleries',
    version: '1.0.0',
    port: 3008,
    status: 'production',
    category: 'media',
    icon: 'images',
    color: '#e83e8c',
    description: 'Media galleries with AI tagging and face detection. FFmpeg-powered video processing.',
    dependencies: ['ca', 'auth', 'filevault'],
    database: {
      enabled: true,
      name: 'exprsn_gallery',
      tables: ['galleries', 'albums', 'items', 'tags', 'faces', 'exif_data'],
      migrations: 10
    },
    redis: {
      enabled: true,
      prefix: 'gallery:',
      keyPatterns: [
        { pattern: 'gallery:item:[item_id]', description: 'Item metadata', ttl: '1h' },
        { pattern: 'gallery:album:[album_id]', description: 'Album cache', ttl: '30m' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/galleries', description: 'Create gallery' },
      { method: 'POST', path: '/api/items', description: 'Upload media' },
      { method: 'POST', path: '/api/tags', description: 'Tag media' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'GALLERY_SERVICE_PORT', default: '3008', required: true, description: 'Service port' }
      ],
      processing: [
        { key: 'FFMPEG_PATH', default: '/usr/bin/ffmpeg', required: false, description: 'FFmpeg binary path' },
        { key: 'ENABLE_FACE_DETECTION', default: 'false', required: false, description: 'Enable face detection' },
        { key: 'ENABLE_AUTO_TAGGING', default: 'false', required: false, description: 'Enable AI tagging' }
      ],
      cdn: [
        { key: 'CDN_ENABLED', default: 'false', required: false, description: 'Enable CDN' },
        { key: 'CDN_ENDPOINT', default: '', required: false, description: 'CDN endpoint URL' }
      ]
    },
    externalDependencies: [
      { name: 'FFmpeg', optional: false, description: 'Video processing' },
      { name: 'Face Detection Library', optional: true, description: 'Face recognition' }
    ],
    features: [
      { key: 'ENABLE_FACE_DETECTION', name: 'Face Detection', description: 'AI face detection', default: false },
      { key: 'TRANSCODE_VIDEOS', name: 'Video Transcoding', description: 'Auto-transcode videos', default: true }
    ],
    setupNotes: 'Requires FFmpeg for video processing. Configure FileVault for storage.',
    resourceRequirements: { cpu: 'Very High', memory: '2GB', storage: '100GB+' }
  },

  live: {
    serviceId: 'live',
    serviceName: 'Live Streaming',
    version: '1.0.0',
    port: 3009,
    status: 'production',
    category: 'media',
    icon: 'broadcast',
    color: '#dc3545',
    description: 'Live streaming with WebRTC signaling. Multi-platform streaming to YouTube, Twitch, Facebook.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_live',
      tables: ['streams', 'viewers', 'chat_messages', 'recordings', 'platform_connections'],
      migrations: 8
    },
    redis: {
      enabled: true,
      prefix: 'live:',
      keyPatterns: [
        { pattern: 'live:stream:[stream_id]', description: 'Stream metadata', ttl: '6h' },
        { pattern: 'live:viewers:[stream_id]', description: 'Viewer count', ttl: '1m' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/streams', description: 'Start stream' },
      { method: 'GET', path: '/api/viewers/:streamId', description: 'Get viewers' },
      { method: 'POST', path: '/api/platforms/connect', description: 'Connect platform' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'LIVE_SERVICE_PORT', default: '3009', required: true, description: 'Service port' }
      ],
      streaming: [
        { key: 'STREAMING_PROVIDER', default: 'cloudflare', required: false, description: 'Provider (cloudflare|srs|custom)' },
        { key: 'CLOUDFLARE_ACCOUNT_ID', default: '', required: false, description: 'Cloudflare account ID' },
        { key: 'CLOUDFLARE_API_TOKEN', default: '', required: false, description: 'Cloudflare API token', sensitive: true }
      ],
      platforms: [
        { key: 'YOUTUBE_CLIENT_ID', default: '', required: false, description: 'YouTube OAuth client ID' },
        { key: 'TWITCH_CLIENT_ID', default: '', required: false, description: 'Twitch client ID' },
        { key: 'FACEBOOK_APP_ID', default: '', required: false, description: 'Facebook app ID' }
      ]
    },
    externalDependencies: [
      { name: 'Cloudflare Stream / SRS', optional: true, description: 'Streaming infrastructure' },
      { name: 'YouTube Live API', optional: true, description: 'Multi-streaming' },
      { name: 'Twitch API', optional: true, description: 'Multi-streaming' }
    ],
    features: [
      { key: 'FFMPEG_ENABLED', name: 'FFmpeg Processing', description: 'Enable FFmpeg processing', default: true }
    ],
    setupNotes: 'Configure streaming provider (Cloudflare or SRS). Multi-platform requires platform API keys.',
    resourceRequirements: { cpu: 'Very High', memory: '4GB', storage: '100GB+' }
  },

  bridge: {
    serviceId: 'bridge',
    serviceName: 'API Gateway',
    version: '1.0.0',
    port: 3010,
    status: 'production',
    category: 'infrastructure',
    icon: 'router',
    color: '#6c757d',
    description: 'API gateway with rate limiting and lexicon routing. Routes requests to backend services.',
    dependencies: ['ca'],
    database: {
      enabled: false,
      name: null,
      tables: [],
      migrations: 0
    },
    redis: {
      enabled: true,
      prefix: 'bridge:',
      keyPatterns: [
        { pattern: 'bridge:ratelimit:[ip]', description: 'Rate limiting', ttl: '1m' }
      ]
    },
    apiEndpoints: [
      { method: 'ALL', path: '/xrpc/*', description: 'Lexicon-based routing' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'PORT', default: '3010', required: true, description: 'Gateway port' }
      ],
      services: [
        { key: 'CA_SERVICE_URL', default: 'http://localhost:3000', required: true, description: 'CA service URL' },
        { key: 'AUTH_SERVICE_URL', default: 'http://localhost:3001', required: true, description: 'Auth service URL' },
        { key: 'TIMELINE_SERVICE_URL', default: 'http://localhost:3004', required: true, description: 'Timeline service URL' }
      ],
      ratelimit: [
        { key: 'RATE_LIMIT_WINDOW_MS', default: '60000', required: false, description: 'Rate limit window (ms)' },
        { key: 'RATE_LIMIT_MAX', default: '100', required: false, description: 'Max requests per window' }
      ]
    },
    externalDependencies: [],
    features: [
      { key: 'CERTIFICATE_BINDING_ENABLED', name: 'Certificate Binding', description: 'Bind requests to certificates', default: true }
    ],
    setupNotes: 'Stateless gateway. Requires CA service for token validation.',
    resourceRequirements: { cpu: 'High', memory: '512MB', storage: '1GB' }
  },

  nexus: {
    serviceId: 'nexus',
    serviceName: 'Groups & Events',
    version: '1.0.0',
    port: 3011,
    status: 'production',
    category: 'social',
    icon: 'people',
    color: '#0dcaf0',
    description: 'Groups, events, CalDAV/CardDAV. Community management with calendar and contacts integration.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_nexus',
      tables: ['groups', 'group_members', 'events', 'calendars', 'contacts'],
      migrations: 12
    },
    redis: {
      enabled: true,
      prefix: 'nexus:',
      keyPatterns: [
        { pattern: 'nexus:group:[group_id]', description: 'Group metadata', ttl: '30m' },
        { pattern: 'nexus:event:[event_id]', description: 'Event cache', ttl: '1h' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/groups', description: 'Create group' },
      { method: 'POST', path: '/api/events', description: 'Create event' },
      { method: 'GET', path: '/caldav/*', description: 'CalDAV protocol' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'SERVICE_PORT', default: '3011', required: true, description: 'Service port' },
        { key: 'ENABLE_FEDERATION', default: 'false', required: false, description: 'Enable group federation' },
        { key: 'MAX_GROUP_SIZE', default: '10000', required: false, description: 'Max group members' }
      ]
    },
    externalDependencies: [],
    features: [
      { key: 'ENABLE_DAO_GOVERNANCE', name: 'DAO Governance', description: 'Decentralized governance', default: false }
    ],
    setupNotes: 'Supports CalDAV/CardDAV protocols for calendar and contact sync.',
    resourceRequirements: { cpu: 'Medium', memory: '512MB', storage: '10GB' }
  },

  pulse: {
    serviceId: 'pulse',
    serviceName: 'Analytics & Metrics',
    version: '1.0.0',
    port: 3012,
    status: 'production',
    category: 'analytics',
    icon: 'graph-up',
    color: '#0d6efd',
    description: 'Analytics and metrics collection. Dashboards, reports, and data visualization.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_pulse',
      tables: ['dashboards', 'widgets', 'datasets', 'queries', 'reports', 'metrics'],
      migrations: 14
    },
    redis: {
      enabled: true,
      prefix: 'pulse:',
      keyPatterns: [
        { pattern: 'pulse:dashboard:[id]', description: 'Dashboard cache', ttl: '15m' },
        { pattern: 'pulse:query:[hash]', description: 'Query result cache', ttl: '5m' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/dashboards', description: 'Create dashboard' },
      { method: 'POST', path: '/api/queries', description: 'Execute query' },
      { method: 'POST', path: '/api/reports/generate', description: 'Generate report' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'PULSE_PORT', default: '3012', required: true, description: 'Service port' }
      ],
      email: [
        { key: 'SMTP_HOST', default: '', required: false, description: 'SMTP host for reports' },
        { key: 'SMTP_PORT', default: '587', required: false, description: 'SMTP port' }
      ],
      performance: [
        { key: 'MAX_CONCURRENT_QUERIES', default: '10', required: false, description: 'Max concurrent queries' },
        { key: 'QUERY_TIMEOUT', default: '30000', required: false, description: 'Query timeout (ms)' }
      ]
    },
    externalDependencies: [
      { name: 'SMTP Server', optional: true, description: 'Email report delivery' }
    ],
    features: [
      { key: 'REALTIME_ENABLED', name: 'Real-time Updates', description: 'Real-time dashboard updates', default: true },
      { key: 'PROMETHEUS_ENABLED', name: 'Prometheus', description: 'Prometheus metrics export', default: false }
    ],
    setupNotes: 'Configure SMTP for scheduled report emails.',
    resourceRequirements: { cpu: 'High', memory: '1GB', storage: '20GB' }
  },

  vault: {
    serviceId: 'vault',
    serviceName: 'Secrets Management',
    version: '1.0.0',
    port: 3013,
    status: 'production',
    category: 'security',
    icon: 'safe',
    color: '#6610f2',
    description: 'Secrets management with encryption at rest. Secure storage for API keys and credentials.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_vault',
      tables: ['secrets', 'secret_versions', 'access_policies', 'audit_logs'],
      migrations: 6
    },
    redis: {
      enabled: false,
      prefix: null,
      keyPatterns: []
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/secrets', description: 'Store secret' },
      { method: 'GET', path: '/api/secrets/:name', description: 'Retrieve secret' },
      { method: 'DELETE', path: '/api/secrets/:name', description: 'Delete secret' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'VAULT_PORT', default: '3013', required: true, description: 'Service port' }
      ],
      encryption: [
        { key: 'VAULT_MASTER_KEY', default: '', required: true, description: 'Master encryption key', sensitive: true, generate: true },
        { key: 'KEY_ROTATION_DAYS', default: '90', required: false, description: 'Key rotation period (days)' }
      ]
    },
    externalDependencies: [
      { name: 'HSM / AWS KMS', optional: true, description: 'Hardware security module' }
    ],
    features: [
      { key: 'AUDIT_ENABLED', name: 'Audit Logging', description: 'Log all secret access', default: true }
    ],
    setupNotes: 'CRITICAL: Securely store the master key. Redis caching disabled for security.',
    resourceRequirements: { cpu: 'Low', memory: '256MB', storage: '5GB' }
  },

  setup: {
    serviceId: 'setup',
    serviceName: 'Setup & Management',
    version: '1.0.0',
    port: 3015,
    status: 'production',
    category: 'infrastructure',
    icon: 'gear',
    color: '#DC382D',
    description: 'Service discovery, health monitoring, and configuration management. Central control panel.',
    dependencies: [],
    database: {
      enabled: true,
      name: 'exprsn_setup',
      tables: ['service_configurations', 'groups', 'roles', 'permissions', 'health_checks'],
      migrations: 6
    },
    redis: {
      enabled: true,
      prefix: 'setup:',
      keyPatterns: [
        { pattern: 'setup:health:[service_id]', description: 'Health check cache', ttl: '30s' },
        { pattern: 'setup:config:[service_id]', description: 'Config cache', ttl: '5m' }
      ]
    },
    apiEndpoints: [
      { method: 'GET', path: '/api/services', description: 'Service discovery' },
      { method: 'GET', path: '/api/health', description: 'Health check' },
      { method: 'PUT', path: '/api/service-config/:id', description: 'Update config' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'PORT', default: '3015', required: true, description: 'Service port' },
        { key: 'HEALTH_CHECK_INTERVAL', default: '5000', required: false, description: 'Health check interval (ms)' }
      ]
    },
    externalDependencies: [],
    features: [
      { key: 'AUTO_DISCOVER', name: 'Auto Discovery', description: 'Automatic service discovery', default: true }
    ],
    setupNotes: 'This service manages the platform. It has no external dependencies.',
    resourceRequirements: { cpu: 'Low', memory: '256MB', storage: '1GB' }
  },

  forge: {
    serviceId: 'forge',
    serviceName: 'Business Platform',
    version: '1.0.0',
    port: 3016,
    status: 'partial',
    category: 'business',
    icon: 'briefcase',
    color: '#fd7e14',
    description: 'CRM (100%), Groupware (40%), and ERP (15%) modules. Business process management platform.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_forge',
      tables: ['contacts', 'accounts', 'leads', 'opportunities', 'cases', 'tasks', 'calendars', 'products'],
      migrations: 25
    },
    redis: {
      enabled: true,
      prefix: 'forge:',
      keyPatterns: [
        { pattern: 'forge:crm:contact:[id]', description: 'Contact cache', ttl: '1h' },
        { pattern: 'forge:calendar:[user_id]', description: 'Calendar cache', ttl: '15m' }
      ]
    },
    apiEndpoints: [
      { method: 'GET', path: '/api/crm/contacts', description: 'List contacts' },
      { method: 'POST', path: '/api/crm/leads', description: 'Create lead' },
      { method: 'POST', path: '/api/groupware/calendar', description: 'Create event' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'FORGE_PORT', default: '3016', required: true, description: 'Service port' }
      ],
      modules: [
        { key: 'ENABLE_CRM', default: 'true', required: false, description: 'Enable CRM module' },
        { key: 'ENABLE_GROUPWARE', default: 'false', required: false, description: 'Enable Groupware module' },
        { key: 'ENABLE_ERP', default: 'false', required: false, description: 'Enable ERP module' }
      ],
      integrations: [
        { key: 'QUICKBOOKS_CLIENT_ID', default: '', required: false, description: 'QuickBooks client ID' },
        { key: 'STRIPE_SECRET_KEY', default: '', required: false, description: 'Stripe secret key', sensitive: true }
      ]
    },
    externalDependencies: [
      { name: 'QuickBooks API', optional: true, description: 'Accounting integration' },
      { name: 'Stripe', optional: true, description: 'Payment processing' }
    ],
    features: [
      { key: 'ENABLE_CRM', name: 'CRM Module', description: 'Customer Relationship Management', default: true },
      { key: 'ENABLE_WORKFLOWS', name: 'Business Workflows', description: 'Workflow automation', default: true }
    ],
    setupNotes: 'CRM module is production-ready. Groupware and ERP are in development.',
    resourceRequirements: { cpu: 'High', memory: '2GB', storage: '50GB' }
  },

  workflow: {
    serviceId: 'workflow',
    serviceName: 'Workflow Automation',
    version: '1.0.0',
    port: 3017,
    status: 'production',
    category: 'automation',
    icon: 'diagram-3',
    color: '#198754',
    description: 'Visual workflow automation with 15 step types. Drag-and-drop workflow builder with JavaScript execution.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_workflow',
      tables: ['workflows', 'workflow_steps', 'executions', 'schedules', 'templates'],
      migrations: 10
    },
    redis: {
      enabled: true,
      prefix: 'workflow:',
      keyPatterns: [
        { pattern: 'workflow:execution:[id]', description: 'Execution state', ttl: '24h' },
        { pattern: 'workflow:schedule:[id]', description: 'Schedule cache', ttl: '1h' }
      ]
    },
    apiEndpoints: [
      { method: 'POST', path: '/api/workflows', description: 'Create workflow' },
      { method: 'POST', path: '/api/workflows/:id/execute', description: 'Execute workflow' },
      { method: 'GET', path: '/api/executions/:id', description: 'Get execution status' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'PORT', default: '3017', required: true, description: 'Service port' }
      ],
      execution: [
        { key: 'WORKFLOW_MAX_EXECUTION_TIME', default: '300000', required: false, description: 'Max execution time (ms)' },
        { key: 'WORKFLOW_MAX_STEPS', default: '100', required: false, description: 'Max workflow steps' },
        { key: 'WORKFLOW_VM_TIMEOUT', default: '5000', required: false, description: 'JavaScript VM timeout (ms)' }
      ]
    },
    externalDependencies: [],
    features: [
      { key: 'ENABLE_VISUAL_DESIGNER', name: 'Visual Designer', description: 'Drag-and-drop workflow builder', default: true },
      { key: 'ENABLE_TEMPLATES', name: 'Workflow Templates', description: 'Pre-built workflow templates', default: true }
    ],
    setupNotes: 'Supports 15 step types including JavaScript code execution (sandboxed with VM2).',
    resourceRequirements: { cpu: 'High', memory: '1GB', storage: '10GB' }
  },

  svr: {
    serviceId: 'svr',
    serviceName: 'Dynamic Page Server',
    version: '1.0.0',
    port: 5000,
    status: 'production',
    category: 'platform',
    icon: 'code-square',
    color: '#6f42c1',
    description: 'Dynamic page server with Low-Code Platform. Visual application builder with entity, grid, and form designers.',
    dependencies: ['ca', 'auth'],
    database: {
      enabled: true,
      name: 'exprsn_svr',
      tables: ['applications', 'entities', 'entity_fields', 'grids', 'forms', 'resources'],
      migrations: 8
    },
    redis: {
      enabled: true,
      prefix: 'svr:',
      keyPatterns: [
        { pattern: 'svr:entity:[id]', description: 'Entity metadata cache', ttl: '30m' },
        { pattern: 'svr:grid:[id]', description: 'Grid config cache', ttl: '15m' },
        { pattern: 'svr:form:[id]', description: 'Form definition cache', ttl: '15m' }
      ]
    },
    apiEndpoints: [
      { method: 'GET', path: '/lowcode', description: 'Low-Code Platform home' },
      { method: 'POST', path: '/api/entities', description: 'Create entity' },
      { method: 'POST', path: '/api/grids', description: 'Create grid' },
      { method: 'POST', path: '/api/forms', description: 'Create form' }
    ],
    environmentVariables: {
      core: [
        { key: 'NODE_ENV', default: 'development', required: true, description: 'Node environment' },
        { key: 'PORT', default: '5000', required: true, description: 'Service port' }
      ],
      security: [
        { key: 'CODE_EXECUTION_ENABLED', default: 'true', required: false, description: 'Enable custom code execution' },
        { key: 'CODE_EXECUTION_TIMEOUT', default: '5000', required: false, description: 'Code execution timeout (ms)' }
      ]
    },
    externalDependencies: [],
    features: [
      { key: 'ENABLE_SQL_INJECTION_DETECTION', name: 'SQL Injection Protection', description: 'Detect SQL injection attempts', default: true },
      { key: 'ENABLE_XSS_PROTECTION', name: 'XSS Protection', description: 'Cross-site scripting protection', default: true }
    ],
    setupNotes: 'Includes complete Low-Code Platform with Entity, Grid, and Form designers.',
    resourceRequirements: { cpu: 'Medium', memory: '1GB', storage: '20GB' }
  }
};

/**
 * Get metadata for a specific service
 * @param {string} serviceId - Service identifier
 * @returns {object|null} Service metadata or null if not found
 */
function getServiceMetadata(serviceId) {
  return serviceMetadata[serviceId] || null;
}

/**
 * Get all service metadata
 * @returns {object} All service metadata
 */
function getAllServiceMetadata() {
  return serviceMetadata;
}

/**
 * Get services by category
 * @param {string} category - Category name (core, content, communication, etc.)
 * @returns {array} Array of service metadata
 */
function getServicesByCategory(category) {
  return Object.values(serviceMetadata).filter(service => service.category === category);
}

/**
 * Get services by dependency
 * @param {string} dependencyId - Service ID that is depended upon
 * @returns {array} Array of services that depend on the specified service
 */
function getServicesByDependency(dependencyId) {
  return Object.values(serviceMetadata).filter(service =>
    service.dependencies.includes(dependencyId)
  );
}

/**
 * Validate service configuration
 * @param {string} serviceId - Service identifier
 * @param {object} config - Configuration object
 * @returns {object} Validation result { valid: boolean, errors: array }
 */
function validateServiceConfiguration(serviceId, config) {
  const service = getServiceMetadata(serviceId);
  if (!service) {
    return { valid: false, errors: ['Service not found'] };
  }

  const errors = [];

  // Validate required environment variables
  Object.entries(service.environmentVariables).forEach(([category, vars]) => {
    vars.forEach(envVar => {
      if (envVar.required && !config.envVars[envVar.key]) {
        errors.push(`Missing required variable: ${envVar.key}`);
      }
    });
  });

  // Validate port
  if (config.port && (config.port < 1024 || config.port > 65535)) {
    errors.push('Port must be between 1024 and 65535');
  }

  // Validate database configuration if enabled
  if (service.database.enabled && config.databaseEnabled) {
    if (!config.databaseName) {
      errors.push('Database name is required');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

module.exports = {
  serviceMetadata,
  getServiceMetadata,
  getAllServiceMetadata,
  getServicesByCategory,
  getServicesByDependency,
  validateServiceConfiguration
};
