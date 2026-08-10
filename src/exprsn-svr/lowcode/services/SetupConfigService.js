/**
 * ═══════════════════════════════════════════════════════════════════════
 * Setup Configuration Service
 * ═══════════════════════════════════════════════════════════════════════
 * Comprehensive platform setup and configuration management
 * Focused on: Services, Databases, Caching, Security, Forge, Low-Code,
 *             Datasources, Templates, and Functions
 * ═══════════════════════════════════════════════════════════════════════
 */

const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const Redis = require('ioredis');
const { Sequelize } = require('sequelize');

const execAsync = promisify(exec);

class SetupConfigService {
  constructor() {
    this.config = {};
    this.serviceRegistry = this.initializeServiceRegistry();
    this.databaseRegistry = this.initializeDatabaseRegistry();
    this.redisDbAllocations = this.initializeRedisAllocations();
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * SERVICE MANAGEMENT
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * Initialize service registry with all 21 Exprsn services
   */
  initializeServiceRegistry() {
    return {
      'exprsn-ca': {
        name: 'Certificate Authority',
        port: 3000,
        category: 'security',
        database: 'exprsn_ca',
        redisDB: 0,
        dependencies: [],
        autoStart: true,
        icon: 'fa-certificate',
        color: '#FF6B35',
        description: 'PKI infrastructure and CA token generation',
        features: ['X.509 Certificates', 'OCSP Validation', 'CRL Management', 'Token Signing'],
        status: 'production'
      },
      'exprsn-auth': {
        name: 'Authentication & SSO',
        port: 3001,
        category: 'security',
        database: 'exprsn_auth',
        redisDB: 1,
        dependencies: ['exprsn-ca'],
        autoStart: true,
        icon: 'fa-key',
        color: '#4ECDC4',
        description: 'OAuth2, SAML, MFA, session management',
        features: ['OAuth 2.0', 'SAML 2.0', 'MFA (TOTP/SMS)', 'Session Management', 'Password Policies'],
        status: 'production'
      },
      'exprsn-filevault': {
        name: 'File Management',
        port: 3007,
        category: 'storage',
        database: 'exprsn_filevault',
        redisDB: 6,
        dependencies: ['exprsn-ca', 'exprsn-auth'],
        autoStart: false,
        icon: 'fa-folder-open',
        color: '#85929E',
        description: 'Secure file storage and management',
        features: ['S3-compatible Storage', 'Encryption at Rest', 'Access Control', 'Versioning', 'Metadata Search'],
        status: 'production'
      },
      'exprsn-bridge': {
        name: 'API Gateway',
        port: 3010,
        category: 'infrastructure',
        database: null,
        redisDB: 9,
        dependencies: ['exprsn-ca'],
        autoStart: true,
        icon: 'fa-project-diagram',
        color: '#58D68D',
        description: 'Unified API gateway and routing',
        features: ['Request Routing', 'Rate Limiting', 'Load Balancing', 'API Versioning', 'Authentication'],
        status: 'production'
      },
      'exprsn-herald': {
        name: 'Notifications',
        port: 3014,
        category: 'communication',
        database: 'exprsn_herald',
        redisDB: 13,
        dependencies: ['exprsn-ca'],
        autoStart: false,
        icon: 'fa-bell',
        color: '#9B59B6',
        description: 'Multi-channel notification delivery',
        features: ['Email', 'SMS', 'Push Notifications', 'In-App Messages', 'Webhooks', 'Templates'],
        status: 'production'
      },
      'exprsn-vault': {
        name: 'Secrets Management',
        port: 3013,
        category: 'security',
        database: 'exprsn_vault',
        redisDB: 12,
        dependencies: ['exprsn-ca'],
        autoStart: true,
        icon: 'fa-vault',
        color: '#34495E',
        description: 'Encrypted secrets and credentials',
        features: ['AES-256 Encryption', 'Secret Rotation', 'Access Auditing', 'KV Store', 'Dynamic Secrets'],
        status: 'production'
      },
      'exprsn-workflow': {
        name: 'Workflow Automation',
        port: 3017,
        category: 'automation',
        database: 'exprsn_workflow',
        redisDB: null,
        dependencies: ['exprsn-ca', 'exprsn-auth'],
        autoStart: false,
        icon: 'fa-sitemap',
        color: '#3498DB',
        description: 'Visual workflow automation',
        features: ['15 Step Types', 'Conditional Logic', 'Loops & Branches', 'JavaScript Execution', 'HTTP Requests', 'Real-time Monitoring'],
        status: 'production'
      },
      'exprsn-payments': {
        name: 'Payment Processing',
        port: 3018,
        category: 'commerce',
        database: 'exprsn_payments',
        redisDB: null,
        dependencies: ['exprsn-ca', 'exprsn-auth'],
        autoStart: false,
        icon: 'fa-credit-card',
        color: '#27AE60',
        description: 'Multi-gateway payment processing',
        features: ['Stripe', 'PayPal', 'Authorize.Net', 'PCI-DSS Compliant', 'Recurring Billing', 'Webhooks'],
        status: 'production'
      }
    };
  }

  /**
   * Check all service health
   */
  async checkAllServices() {
    const results = [];

    for (const [serviceId, serviceDef] of Object.entries(this.serviceRegistry)) {
      const health = await this.checkService(serviceDef.port);
      results.push({
        id: serviceId,
        name: serviceDef.name,
        category: serviceDef.category,
        port: serviceDef.port,
        status: health.running ? 'running' : 'stopped',
        responseTime: health.responseTime,
        uptime: health.uptime,
        url: `http://localhost:${serviceDef.port}`,
        database: serviceDef.database,
        redisDB: serviceDef.redisDB,
        dependencies: serviceDef.dependencies,
        autoStart: serviceDef.autoStart,
        icon: serviceDef.icon,
        color: serviceDef.color,
        description: serviceDef.description,
        features: serviceDef.features,
        productionStatus: serviceDef.status
      });
    }

    return results;
  }

  /**
   * Check individual service
   */
  async checkService(port, timeout = 2000) {
    const startTime = Date.now();

    try {
      const response = await axios.get(`http://localhost:${port}/health`, {
        timeout,
        validateStatus: () => true
      });

      const responseTime = Date.now() - startTime;

      return {
        running: response.status < 500,
        responseTime,
        uptime: response.data?.uptime || null,
        data: response.data || {}
      };
    } catch (error) {
      return {
        running: false,
        responseTime: Date.now() - startTime,
        uptime: null,
        error: error.code || error.message
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * DATABASE MANAGEMENT
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * Initialize database registry
   */
  initializeDatabaseRegistry() {
    return {
      'exprsn_ca': {
        service: 'exprsn-ca',
        name: 'exprsn_ca',
        description: 'Certificate Authority database',
        priority: 1
      },
      'exprsn_auth': {
        service: 'exprsn-auth',
        name: 'exprsn_auth',
        description: 'Authentication and SSO database',
        priority: 2
      },
      'exprsn_spark': {
        service: 'exprsn-spark',
        name: 'exprsn_spark',
        description: 'Real-time messaging database',
        priority: 3
      },
      'exprsn_timeline': {
        service: 'exprsn-timeline',
        name: 'exprsn_timeline',
        description: 'Social feed database',
        priority: 3
      },
      'exprsn_moderator': {
        service: 'exprsn-moderator',
        name: 'exprsn_moderator',
        description: 'Content moderation database',
        priority: 3
      },
      'exprsn_filevault': {
        service: 'exprsn-filevault',
        name: 'exprsn_filevault',
        description: 'File storage database',
        priority: 3
      },
      'exprsn_gallery': {
        service: 'exprsn-gallery',
        name: 'exprsn_gallery',
        description: 'Media galleries database',
        priority: 3
      },
      'exprsn_live': {
        service: 'exprsn-live',
        name: 'exprsn_live',
        description: 'Live streaming database',
        priority: 3
      },
      'exprsn_nexus': {
        service: 'exprsn-nexus',
        name: 'exprsn_nexus',
        description: 'Groups and events database',
        priority: 3
      },
      'exprsn_pulse': {
        service: 'exprsn-pulse',
        name: 'exprsn_pulse',
        description: 'Analytics database',
        priority: 3
      },
      'exprsn_vault': {
        service: 'exprsn-vault',
        name: 'exprsn_vault',
        description: 'Secrets management database',
        priority: 2
      },
      'exprsn_herald': {
        service: 'exprsn-herald',
        name: 'exprsn_herald',
        description: 'Notifications database',
        priority: 3
      },
      'exprsn_setup': {
        service: 'exprsn-setup',
        name: 'exprsn_setup',
        description: 'Setup and management database',
        priority: 2
      },
      'exprsn_forge': {
        service: 'exprsn-forge',
        name: 'exprsn_forge',
        description: 'Forge CRM/ERP/Groupware database',
        priority: 2
      },
      'exprsn_workflow': {
        service: 'exprsn-workflow',
        name: 'exprsn_workflow',
        description: 'Workflow automation database',
        priority: 3
      },
      'exprsn_payments': {
        service: 'exprsn-payments',
        name: 'exprsn_payments',
        description: 'Payment processing database',
        priority: 3
      },
      'exprsn_atlas': {
        service: 'exprsn-atlas',
        name: 'exprsn_atlas',
        description: 'Geospatial services database (PostGIS)',
        priority: 3
      },
      'exprsn_lowcode': {
        service: 'exprsn-svr',
        name: 'exprsn_lowcode',
        description: 'Low-Code platform database',
        priority: 2
      }
    };
  }

  /**
   * Get all databases with status
   */
  async getAllDatabases() {
    const databases = [];

    for (const [dbId, dbDef] of Object.entries(this.databaseRegistry)) {
      const status = await this.checkDatabaseConnection(dbDef.name);

      databases.push({
        id: dbId,
        name: dbDef.name,
        service: dbDef.service,
        description: dbDef.description,
        priority: dbDef.priority,
        connected: status.connected,
        tableCount: status.tableCount,
        size: status.size,
        version: status.version,
        migrationsTotal: status.migrationsTotal || 0,
        migrationsPending: status.migrationsPending || 0,
        lastBackup: status.lastBackup
      });
    }

    return databases;
  }

  /**
   * Check database connection
   */
  async checkDatabaseConnection(databaseName) {
    try {
      const sequelize = new Sequelize(databaseName, process.env.DB_USER || 'postgres', process.env.DB_PASSWORD || '', {
        host: process.env.DB_HOST || 'localhost',
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: false
      });

      await sequelize.authenticate();

      // Get table count
      const [tables] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
      `);
      const tableCount = parseInt(tables[0].count);

      // Get database size
      const [sizeResult] = await sequelize.query(`
        SELECT pg_database_size('${databaseName}') as size
      `);
      const size = parseInt(sizeResult[0].size);

      // Get version
      const [versionResult] = await sequelize.query('SELECT version()');
      const version = versionResult[0].version;

      await sequelize.close();

      return {
        connected: true,
        tableCount,
        size,
        version,
        migrationsTotal: 0,
        migrationsPending: 0,
        lastBackup: null
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
        tableCount: 0,
        size: 0,
        version: null,
        migrationsTotal: 0,
        migrationsPending: 0,
        lastBackup: null
      };
    }
  }

  /**
   * Run migrations for a database
   */
  async runMigrations(databaseName) {
    try {
      const serviceDir = this.getServiceDirectory(databaseName);
      if (!serviceDir) {
        return { success: false, message: 'Service directory not found' };
      }

      const { stdout, stderr } = await execAsync('npx sequelize-cli db:migrate', {
        cwd: serviceDir,
        env: { ...process.env, DB_NAME: databaseName }
      });

      return {
        success: true,
        message: 'Migrations completed successfully',
        output: stdout,
        errors: stderr
      };
    } catch (error) {
      return {
        success: false,
        message: 'Migration failed',
        error: error.message
      };
    }
  }

  /**
   * Get service directory for database
   */
  getServiceDirectory(databaseName) {
    const serviceMap = {
      'exprsn_ca': 'exprsn-ca',
      'exprsn_auth': 'exprsn-auth',
      'exprsn_spark': 'exprsn-spark',
      'exprsn_timeline': 'exprsn-timeline',
      'exprsn_moderator': 'exprsn-moderator',
      'exprsn_filevault': 'exprsn-filevault',
      'exprsn_gallery': 'exprsn-gallery',
      'exprsn_live': 'exprsn-live',
      'exprsn_nexus': 'exprsn-nexus',
      'exprsn_pulse': 'exprsn-pulse',
      'exprsn_vault': 'exprsn-vault',
      'exprsn_herald': 'exprsn-herald',
      'exprsn_setup': 'exprsn-setup',
      'exprsn_forge': 'exprsn-forge',
      'exprsn_workflow': 'exprsn-workflow',
      'exprsn_payments': 'exprsn-payments',
      'exprsn_atlas': 'exprsn-atlas',
      'exprsn_lowcode': 'exprsn-svr/lowcode'
    };

    const serviceName = serviceMap[databaseName];
    if (!serviceName) return null;

    return path.join(__dirname, '../../../../', serviceName);
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * REDIS CONFIGURATION
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * Initialize Redis DB allocations
   */
  initializeRedisAllocations() {
    return [
      { db: 0, service: 'exprsn-ca', purpose: 'CA token cache', prefix: 'ca:' },
      { db: 1, service: 'exprsn-auth', purpose: 'Sessions & OAuth', prefix: 'auth:' },
      { db: 2, service: 'exprsn-spark', purpose: 'Chat & presence', prefix: 'spark:' },
      { db: 3, service: 'exprsn-timeline', purpose: 'Feed cache', prefix: 'timeline:' },
      { db: 4, service: 'exprsn-prefetch', purpose: 'Prefetch queue', prefix: 'prefetch:' },
      { db: 5, service: 'exprsn-moderator', purpose: 'Moderation queue', prefix: 'mod:' },
      { db: 6, service: 'exprsn-filevault', purpose: 'Upload cache', prefix: 'files:' },
      { db: 7, service: 'exprsn-gallery', purpose: 'Media metadata', prefix: 'gallery:' },
      { db: 8, service: 'exprsn-live', purpose: 'Stream state', prefix: 'live:' },
      { db: 9, service: 'exprsn-bridge', purpose: 'API rate limits', prefix: 'bridge:' },
      { db: 10, service: 'exprsn-nexus', purpose: 'Group cache', prefix: 'nexus:' },
      { db: 11, service: 'exprsn-pulse', purpose: 'Metrics buffer', prefix: 'pulse:' },
      { db: 12, service: 'exprsn-vault', purpose: 'Secret cache', prefix: 'vault:' },
      { db: 13, service: 'exprsn-herald', purpose: 'Notification queue', prefix: 'herald:' },
      { db: 14, service: 'exprsn-setup', purpose: 'Config cache', prefix: 'setup:' },
      { db: 15, service: 'exprsn-svr', purpose: 'Low-Code cache', prefix: 'lowcode:' }
    ];
  }

  /**
   * Get Redis configuration
   */
  async getRedisConfig() {
    const config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD || null,
      enabled: process.env.REDIS_ENABLED !== 'false',
      connected: false,
      version: null,
      databases: []
    };

    if (!config.enabled) {
      return config;
    }

    try {
      const redis = new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        lazyConnect: true
      });

      await redis.connect();
      await redis.ping();

      const info = await redis.info('server');
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      config.version = versionMatch ? versionMatch[1] : 'unknown';
      config.connected = true;

      // Get stats for each DB
      for (const allocation of this.redisDbAllocations) {
        await redis.select(allocation.db);
        const keyCount = await redis.dbsize();
        const memory = await redis.memory('usage', allocation.prefix + '*');

        config.databases.push({
          ...allocation,
          keyCount,
          memory: memory || 0
        });
      }

      await redis.quit();
    } catch (error) {
      config.error = error.message;
    }

    return config;
  }

  /**
   * Test Redis connection
   */
  async testRedisConnection(host, port, password) {
    try {
      const redis = new Redis({
        host,
        port,
        password: password || undefined,
        lazyConnect: true,
        retryStrategy: () => null
      });

      await redis.connect();
      await redis.ping();

      const info = await redis.info('server');
      const versionMatch = info.match(/redis_version:([^\r\n]+)/);
      const version = versionMatch ? versionMatch[1] : 'unknown';

      await redis.quit();

      return {
        success: true,
        message: 'Redis connection successful',
        version
      };
    } catch (error) {
      return {
        success: false,
        message: 'Redis connection failed',
        error: error.message
      };
    }
  }

  /**
   * Flush Redis database
   */
  async flushRedisDb(dbNumber) {
    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: dbNumber
      });

      await redis.flushdb();
      await redis.quit();

      return {
        success: true,
        message: `Redis DB ${dbNumber} flushed successfully`
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to flush Redis DB',
        error: error.message
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * SYSTEM HEALTH
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * Get complete system health
   */
  async getSystemHealth() {
    try {
      const [services, databases, redis] = await Promise.all([
        this.checkAllServices(),
        this.getAllDatabases(),
        this.getRedisConfig()
      ]);

      const servicesRunning = services.filter(s => s.status === 'running').length;
      const databasesConnected = databases.filter(db => db.connected).length;

      return {
        overall: {
          status: this.calculateOverallStatus(services, databases, redis),
          timestamp: new Date().toISOString()
        },
        services: {
          running: servicesRunning,
          total: services.length,
          percentage: Math.round((servicesRunning / services.length) * 100),
          details: services
        },
        databases: {
          connected: databasesConnected,
          total: databases.length,
          percentage: Math.round((databasesConnected / databases.length) * 100),
          details: databases
        },
        redis: {
          ...redis,
          allocated: redis.databases ? redis.databases.length : 0
        }
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Calculate overall system status
   */
  calculateOverallStatus(services, databases, redis) {
    // Critical services that must be running
    const criticalServices = ['exprsn-ca', 'exprsn-svr'];
    const criticalRunning = services
      .filter(s => criticalServices.includes(s.id))
      .every(s => s.status === 'running');

    const criticalDatabases = ['exprsn_ca', 'exprsn_lowcode'];
    const criticalDbConnected = databases
      .filter(db => criticalDatabases.includes(db.id))
      .every(db => db.connected);

    if (!criticalRunning || !criticalDbConnected) {
      return 'critical';
    }

    const servicesRunningPct = services.filter(s => s.status === 'running').length / services.length;
    const databasesConnectedPct = databases.filter(db => db.connected).length / databases.length;

    const avgPct = (servicesRunningPct + databasesConnectedPct) / 2;

    if (avgPct >= 0.9) {
      return 'healthy';
    } else if (avgPct >= 0.7) {
      return 'degraded';
    } else {
      return 'unhealthy';
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * ENVIRONMENT CONFIGURATION MANAGEMENT
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * Get all environment configuration variables
   */
  async getEnvironmentConfig() {
    return {
      application: {
        nodeEnv: process.env.NODE_ENV || 'development',
        port: parseInt(process.env.PORT, 10) || 5001,
        serviceName: process.env.SERVICE_NAME || 'exprsn-svr'
      },
      database: {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        name: process.env.DB_NAME || 'exprsn_svr',
        user: process.env.DB_USER || 'postgres',
        poolMax: parseInt(process.env.DB_POOL_MAX, 10) || 20,
        poolMin: parseInt(process.env.DB_POOL_MIN, 10) || 5
      },
      redis: {
        enabled: process.env.REDIS_ENABLED === 'true',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        db: parseInt(process.env.REDIS_DB, 10) || 0,
        cacheTTL: parseInt(process.env.CACHE_TTL, 10) || 3600
      },
      ca: {
        url: process.env.CA_URL || 'http://localhost:3000',
        verifyTokens: process.env.CA_VERIFY_TOKENS === 'true',
        publicKeyPath: process.env.CA_PUBLIC_KEY_PATH || './keys/ca-public.pem'
      },
      lowCode: {
        devAuth: process.env.LOW_CODE_DEV_AUTH === 'true'
      },
      security: {
        enableSQLInjection: process.env.ENABLE_SQL_INJECTION_DETECTION === 'true',
        enableXSS: process.env.ENABLE_XSS_PROTECTION === 'true',
        allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').filter(Boolean)
      },
      codeExecution: {
        enabled: process.env.CODE_EXECUTION_ENABLED === 'true',
        timeout: parseInt(process.env.CODE_EXECUTION_TIMEOUT, 10) || 5000,
        memoryLimit: parseInt(process.env.CODE_EXECUTION_MEMORY_LIMIT, 10) || 128
      },
      socketIO: {
        enabled: process.env.SOCKET_IO_ENABLED === 'true',
        path: process.env.SOCKET_IO_PATH || '/socket.io',
        corsOrigins: (process.env.SOCKET_IO_CORS_ORIGINS || '').split(',').filter(Boolean)
      },
      storage: {
        maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 10485760,
        uploadDir: process.env.UPLOAD_DIR || './uploads',
        staticDir: process.env.STATIC_DIR || './public'
      },
      rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100
      },
      logging: {
        level: process.env.LOG_LEVEL || 'info',
        dir: process.env.LOG_DIR || './logs',
        maxFiles: parseInt(process.env.LOG_MAX_FILES, 10) || 30
      }
    };
  }

  /**
   * Update environment configuration
   * @param {Object} updates - Configuration updates
   */
  async updateEnvironmentConfig(updates) {
    try {
      const envPath = path.join(__dirname, '../../.env');
      let envContent = '';

      try {
        envContent = await fs.readFile(envPath, 'utf8');
      } catch (error) {
        // .env doesn't exist, create it
        envContent = '';
      }

      // Parse existing env content
      const envVars = {};
      envContent.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
          envVars[match[1].trim()] = match[2].trim();
        }
      });

      // Apply updates
      if (updates.database) {
        if (updates.database.host) envVars.DB_HOST = updates.database.host;
        if (updates.database.port) envVars.DB_PORT = updates.database.port.toString();
        if (updates.database.name) envVars.DB_NAME = updates.database.name;
        if (updates.database.user) envVars.DB_USER = updates.database.user;
        if (updates.database.poolMax) envVars.DB_POOL_MAX = updates.database.poolMax.toString();
        if (updates.database.poolMin) envVars.DB_POOL_MIN = updates.database.poolMin.toString();
      }

      if (updates.redis) {
        if (updates.redis.enabled !== undefined) envVars.REDIS_ENABLED = updates.redis.enabled.toString();
        if (updates.redis.host) envVars.REDIS_HOST = updates.redis.host;
        if (updates.redis.port) envVars.REDIS_PORT = updates.redis.port.toString();
        if (updates.redis.db !== undefined) envVars.REDIS_DB = updates.redis.db.toString();
        if (updates.redis.cacheTTL) envVars.CACHE_TTL = updates.redis.cacheTTL.toString();
      }

      if (updates.security) {
        if (updates.security.enableSQLInjection !== undefined) {
          envVars.ENABLE_SQL_INJECTION_DETECTION = updates.security.enableSQLInjection.toString();
        }
        if (updates.security.enableXSS !== undefined) {
          envVars.ENABLE_XSS_PROTECTION = updates.security.enableXSS.toString();
        }
      }

      // Write back to .env
      const newEnvContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      await fs.writeFile(envPath, newEnvContent, 'utf8');

      return {
        success: true,
        message: 'Configuration updated successfully',
        note: 'Server restart required for changes to take effect'
      };
    } catch (error) {
      throw new Error(`Failed to update configuration: ${error.message}`);
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * ADVANCED DATABASE OPERATIONS
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * Get database statistics for a specific database
   */
  async getDatabaseStatistics(databaseName) {
    try {
      const sequelize = new Sequelize(databaseName, process.env.DB_USER || 'postgres', process.env.DB_PASSWORD, {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        dialect: 'postgres',
        logging: false
      });

      await sequelize.authenticate();

      // Get table count
      const [tables] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      `);

      // Get database size
      const [size] = await sequelize.query(`
        SELECT pg_size_pretty(pg_database_size($1)) as size
      `, {
        bind: [databaseName]
      });

      // Get connection count
      const [connections] = await sequelize.query(`
        SELECT COUNT(*) as count
        FROM pg_stat_activity
        WHERE datname = $1
      `, {
        bind: [databaseName]
      });

      // Get table sizes
      const [tableSizes] = await sequelize.query(`
        SELECT
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
          pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
        FROM pg_tables
        WHERE schemaname = 'public'
        ORDER BY size_bytes DESC
        LIMIT 10
      `);

      await sequelize.close();

      return {
        success: true,
        statistics: {
          tableCount: parseInt(tables[0].count),
          databaseSize: size[0].size,
          connectionCount: parseInt(connections[0].count),
          largestTables: tableSizes
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Backup database to SQL file
   */
  async backupDatabase(databaseName, backupPath = null) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = backupPath || path.join(__dirname, `../../backups/${databaseName}_${timestamp}.sql`);

      // Ensure backup directory exists
      const backupDir = path.dirname(filename);
      await fs.mkdir(backupDir, { recursive: true });

      const command = `pg_dump -h ${process.env.DB_HOST || 'localhost'} -p ${process.env.DB_PORT || 5432} -U ${process.env.DB_USER || 'postgres'} -d ${databaseName} -f ${filename}`;

      await execAsync(command, {
        env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' }
      });

      const stats = await fs.stat(filename);

      return {
        success: true,
        message: 'Database backed up successfully',
        backup: {
          filename,
          size: stats.size,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to backup database'
      };
    }
  }

  /**
   * Restore database from SQL file
   */
  async restoreDatabase(databaseName, backupFile) {
    try {
      // Check if backup file exists
      await fs.access(backupFile);

      const command = `psql -h ${process.env.DB_HOST || 'localhost'} -p ${process.env.DB_PORT || 5432} -U ${process.env.DB_USER || 'postgres'} -d ${databaseName} -f ${backupFile}`;

      await execAsync(command, {
        env: { ...process.env, PGPASSWORD: process.env.DB_PASSWORD || '' }
      });

      return {
        success: true,
        message: 'Database restored successfully',
        restore: {
          database: databaseName,
          file: backupFile,
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to restore database'
      };
    }
  }

  /**
   * Get migration status for a database
   */
  async getMigrationStatus(databaseName) {
    try {
      const serviceDir = this.getServiceDirectory(databaseName);
      if (!serviceDir) {
        throw new Error('Service directory not found');
      }

      const sequelize = new Sequelize(databaseName, process.env.DB_USER || 'postgres', process.env.DB_PASSWORD, {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT, 10) || 5432,
        dialect: 'postgres',
        logging: false
      });

      await sequelize.authenticate();

      // Get executed migrations
      const [migrations] = await sequelize.query(`
        SELECT name, created_at
        FROM "SequelizeMeta"
        ORDER BY created_at DESC
      `).catch(() => [[]]);

      // Get pending migrations
      const migrationsPath = path.join(serviceDir, 'migrations');
      let pendingMigrations = [];

      try {
        const files = await fs.readdir(migrationsPath);
        const executedNames = migrations.map(m => m.name);
        pendingMigrations = files.filter(f => f.endsWith('.js') && !executedNames.includes(f));
      } catch (error) {
        // Migrations directory doesn't exist
      }

      await sequelize.close();

      return {
        success: true,
        migrations: {
          executed: migrations.length,
          pending: pendingMigrations.length,
          executedList: migrations,
          pendingList: pendingMigrations
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * ADVANCED REDIS OPERATIONS
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * Get Redis database info and statistics
   */
  async getRedisDbInfo(dbNumber = 0) {
    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: dbNumber,
        lazyConnect: true
      });

      await redis.connect();

      // Get database info
      const info = await redis.info('keyspace');
      const dbInfo = info.match(new RegExp(`db${dbNumber}:keys=(\\d+),expires=(\\d+)`));

      // Get memory usage
      const memoryInfo = await redis.info('memory');
      const usedMemory = memoryInfo.match(/used_memory_human:([^\r\n]+)/);
      const maxMemory = memoryInfo.match(/maxmemory_human:([^\r\n]+)/);

      // Get sample keys
      const keys = await redis.keys('*');
      const sampleKeys = keys.slice(0, 10);

      // Get key details for samples
      const keyDetails = await Promise.all(
        sampleKeys.map(async (key) => {
          const type = await redis.type(key);
          const ttl = await redis.ttl(key);
          return { key, type, ttl: ttl === -1 ? 'never' : `${ttl}s` };
        })
      );

      await redis.quit();

      return {
        success: true,
        dbNumber,
        statistics: {
          keyCount: dbInfo ? parseInt(dbInfo[1]) : 0,
          expiresCount: dbInfo ? parseInt(dbInfo[2]) : 0,
          usedMemory: usedMemory ? usedMemory[1] : 'N/A',
          maxMemory: maxMemory ? maxMemory[1] : 'N/A',
          sampleKeys: keyDetails
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get Redis key pattern matches
   */
  async getRedisKeysByPattern(pattern = '*', dbNumber = 0, limit = 100) {
    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: dbNumber,
        lazyConnect: true
      });

      await redis.connect();

      const keys = await redis.keys(pattern);
      const limitedKeys = keys.slice(0, limit);

      const keyDetails = await Promise.all(
        limitedKeys.map(async (key) => {
          const type = await redis.type(key);
          const ttl = await redis.ttl(key);
          let value = null;

          if (type === 'string') {
            value = await redis.get(key);
          }

          return {
            key,
            type,
            ttl: ttl === -1 ? 'never' : `${ttl}s`,
            value: value ? (value.length > 100 ? value.substring(0, 100) + '...' : value) : null
          };
        })
      );

      await redis.quit();

      return {
        success: true,
        pattern,
        dbNumber,
        totalMatches: keys.length,
        returned: limitedKeys.length,
        keys: keyDetails
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Delete Redis keys by pattern
   */
  async deleteRedisKeysByPattern(pattern, dbNumber = 0) {
    try {
      const redis = new Redis({
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT, 10) || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: dbNumber,
        lazyConnect: true
      });

      await redis.connect();

      const keys = await redis.keys(pattern);
      let deleted = 0;

      if (keys.length > 0) {
        deleted = await redis.del(...keys);
      }

      await redis.quit();

      return {
        success: true,
        pattern,
        dbNumber,
        deleted
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * CA (CERTIFICATE AUTHORITY) CONFIGURATION
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * Get CA configuration and status
   */
  async getCAConfiguration() {
    const config = require('../../config');
    const fs = require('fs').promises;
    const path = require('path');
    const axios = require('axios');

    try {
      // Check CA service health
      let caServiceHealth = {
        running: false,
        responseTime: null,
        version: null,
        certificates: null,
        tokens: null
      };

      try {
        const startTime = Date.now();
        const response = await axios.get(`${config.ca.url}/health`, { timeout: 5000 });
        caServiceHealth = {
          running: response.status === 200,
          responseTime: Date.now() - startTime,
          version: response.data?.version || 'unknown',
          certificates: response.data?.stats?.certificates || 0,
          tokens: response.data?.stats?.tokens || 0
        };
      } catch (error) {
        // CA service not running
      }

      // Check if CA public key exists
      let publicKeyStatus = {
        exists: false,
        path: config.ca.publicKeyPath,
        size: null,
        modified: null,
        fingerprint: null
      };

      try {
        const keyPath = path.resolve(config.ca.publicKeyPath);
        const stats = await fs.stat(keyPath);
        const keyContent = await fs.readFile(keyPath, 'utf8');

        // Calculate fingerprint
        const forge = require('node-forge');
        const publicKey = forge.pki.publicKeyFromPem(keyContent);
        const der = forge.asn1.toDer(forge.pki.publicKeyToAsn1(publicKey)).getBytes();
        const md = forge.md.sha256.create();
        md.update(der);
        const fingerprint = md.digest().toHex();

        publicKeyStatus = {
          exists: true,
          path: config.ca.publicKeyPath,
          size: stats.size,
          modified: stats.mtime,
          fingerprint: fingerprint.match(/.{1,2}/g).join(':').toUpperCase()
        };
      } catch (error) {
        // Public key not found
      }

      // Get token validation statistics from recent logs
      const tokenStats = {
        validated: 0,
        failed: 0,
        expired: 0,
        lastValidation: null
      };

      return {
        service: {
          url: config.ca.url,
          health: caServiceHealth,
          autoStart: this.serviceRegistry['exprsn-ca']?.autoStart || false
        },
        publicKey: publicKeyStatus,
        validation: {
          enabled: config.ca.verifyTokens,
          devBypass: process.env.CA_TOKEN_VALIDATION_ENABLED === 'false',
          statistics: tokenStats
        },
        integration: {
          lowCodeDevAuth: process.env.LOW_CODE_DEV_AUTH === 'true',
          servicesUsingCA: Object.values(this.serviceRegistry)
            .filter(s => s.dependencies && s.dependencies.includes('exprsn-ca'))
            .map(s => ({ id: s.port, name: s.name }))
        }
      };
    } catch (error) {
      throw new Error('Failed to get CA configuration: ' + error.message);
    }
  }

  /**
   * Update CA configuration
   */
  async updateCAConfiguration(updates) {
    const config = require('../../config');
    const envUpdates = {};

    if (updates.caUrl !== undefined) {
      envUpdates.CA_URL = updates.caUrl;
    }

    if (updates.verifyTokens !== undefined) {
      envUpdates.CA_VERIFY_TOKENS = updates.verifyTokens ? 'true' : 'false';
    }

    if (updates.publicKeyPath !== undefined) {
      envUpdates.CA_PUBLIC_KEY_PATH = updates.publicKeyPath;
    }

    if (updates.lowCodeDevAuth !== undefined) {
      envUpdates.LOW_CODE_DEV_AUTH = updates.lowCodeDevAuth ? 'true' : 'false';
    }

    if (updates.devBypass !== undefined) {
      envUpdates.CA_TOKEN_VALIDATION_ENABLED = updates.devBypass ? 'false' : 'true';
    }

    // Update .env file
    if (Object.keys(envUpdates).length > 0) {
      await this.updateEnvironmentConfig(envUpdates);
    }

    return {
      success: true,
      updated: Object.keys(envUpdates),
      message: 'CA configuration updated. Restart server to apply changes.'
    };
  }

  /**
   * Test CA connection and token generation
   */
  async testCAConnection() {
    const config = require('../../config');
    const axios = require('axios');

    try {
      const startTime = Date.now();

      // Test health endpoint
      const healthResponse = await axios.get(`${config.ca.url}/health`, { timeout: 5000 });

      // Test token generation endpoint (if available)
      let tokenGeneration = { available: false };
      try {
        const tokenResponse = await axios.post(`${config.ca.url}/api/tokens/generate`, {
          userId: 'test-user',
          permissions: { read: true }
        }, { timeout: 5000 });

        tokenGeneration = {
          available: true,
          tokenId: tokenResponse.data?.token?.id || null
        };
      } catch (error) {
        tokenGeneration = {
          available: false,
          error: error.message
        };
      }

      return {
        success: true,
        responseTime: Date.now() - startTime,
        version: healthResponse.data?.version || 'unknown',
        endpoints: {
          health: true,
          tokenGeneration: tokenGeneration.available
        },
        message: 'CA service is reachable and responding'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to CA service'
      };
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * AUTH (AUTHENTICATION & SSO) CONFIGURATION
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * Get Auth configuration and status
   */
  async getAuthConfiguration() {
    const config = require('../../config');
    const axios = require('axios');

    try {
      // Check Auth service health
      let authServiceHealth = {
        running: false,
        responseTime: null,
        version: null,
        users: null,
        sessions: null
      };

      try {
        const startTime = Date.now();
        const response = await axios.get('http://localhost:3001/health', { timeout: 5000 });
        authServiceHealth = {
          running: response.status === 200,
          responseTime: Date.now() - startTime,
          version: response.data?.version || 'unknown',
          users: response.data?.stats?.users || 0,
          sessions: response.data?.stats?.sessions || 0
        };
      } catch (error) {
        // Auth service not running
      }

      return {
        service: {
          port: 3001,
          health: authServiceHealth,
          autoStart: this.serviceRegistry['exprsn-auth']?.autoStart || false
        },
        session: {
          secret: config.session?.secret ? '***' + config.session.secret.slice(-4) : null,
          secure: config.session?.secure || false,
          maxAge: config.session?.maxAge || 86400000
        },
        jwt: {
          secret: config.jwt?.secret ? '***' + config.jwt.secret.slice(-4) : null,
          expiresIn: config.jwt?.expiresIn || '24h'
        },
        security: {
          sqlInjectionDetection: config.security?.enableSQLInjectionDetection || false,
          xssProtection: config.security?.enableXSSProtection || false,
          allowedOrigins: config.security?.allowedOrigins || []
        },
        features: {
          oauth: {
            enabled: true,
            providers: ['google', 'github', 'microsoft']
          },
          saml: {
            enabled: true,
            providers: []
          },
          mfa: {
            enabled: true,
            methods: ['totp', 'sms', 'email']
          }
        },
        integration: {
          lowCodeDevMode: process.env.LOW_CODE_DEV_AUTH === 'true',
          servicesUsingAuth: Object.values(this.serviceRegistry)
            .filter(s => s.dependencies && s.dependencies.includes('exprsn-auth'))
            .map(s => ({ id: s.port, name: s.name }))
        }
      };
    } catch (error) {
      throw new Error('Failed to get Auth configuration: ' + error.message);
    }
  }

  /**
   * Update Auth configuration
   */
  async updateAuthConfiguration(updates) {
    const envUpdates = {};

    if (updates.sessionSecret !== undefined) {
      envUpdates.SESSION_SECRET = updates.sessionSecret;
    }

    if (updates.jwtSecret !== undefined) {
      envUpdates.JWT_SECRET = updates.jwtSecret;
    }

    if (updates.enableSQLInjectionDetection !== undefined) {
      envUpdates.ENABLE_SQL_INJECTION_DETECTION = updates.enableSQLInjectionDetection ? 'true' : 'false';
    }

    if (updates.enableXSSProtection !== undefined) {
      envUpdates.ENABLE_XSS_PROTECTION = updates.enableXSSProtection ? 'true' : 'false';
    }

    if (updates.allowedOrigins !== undefined) {
      envUpdates.ALLOWED_ORIGINS = Array.isArray(updates.allowedOrigins)
        ? updates.allowedOrigins.join(',')
        : updates.allowedOrigins;
    }

    // Update .env file
    if (Object.keys(envUpdates).length > 0) {
      await this.updateEnvironmentConfig(envUpdates);
    }

    return {
      success: true,
      updated: Object.keys(envUpdates),
      message: 'Auth configuration updated. Restart server to apply changes.'
    };
  }

  /**
   * Test Auth service connection
   */
  async testAuthConnection() {
    const axios = require('axios');

    try {
      const startTime = Date.now();

      // Test health endpoint
      const healthResponse = await axios.get('http://localhost:3001/health', { timeout: 5000 });

      // Test endpoints availability
      const endpoints = {
        health: true,
        login: false,
        register: false,
        oauth: false
      };

      try {
        await axios.get('http://localhost:3001/api/auth/login', { timeout: 2000 });
        endpoints.login = true;
      } catch (error) {
        // Endpoint may require POST or return 404
      }

      return {
        success: true,
        responseTime: Date.now() - startTime,
        version: healthResponse.data?.version || 'unknown',
        endpoints,
        message: 'Auth service is reachable and responding'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to Auth service'
      };
    }
  }

  /**
   * Generate new session/JWT secrets
   */
  generateSecrets() {
    const crypto = require('crypto');

    return {
      sessionSecret: crypto.randomBytes(64).toString('hex'),
      jwtSecret: crypto.randomBytes(64).toString('hex'),
      timestamp: new Date().toISOString()
    };
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * VAULT (SECRETS MANAGEMENT) CONFIGURATION
   * ═══════════════════════════════════════════════════════════════════
   */

  /**
   * Get Vault configuration with all aspects
   * @returns {Promise<Object>} Vault configuration details
   */
  async getVaultConfiguration() {
    const axios = require('axios');
    const vaultUrl = process.env.VAULT_URL || 'http://localhost:3013';

    try {
      // Check Vault service health
      let vaultServiceHealth = {
        running: false,
        responseTime: null,
        version: null,
        sealed: null,
        initialized: null
      };

      try {
        const startTime = Date.now();
        const response = await axios.get(`${vaultUrl}/health`, { timeout: 5000 });
        vaultServiceHealth = {
          running: response.status === 200,
          responseTime: Date.now() - startTime,
          version: response.data?.version || 'unknown',
          sealed: response.data?.sealed || false,
          initialized: response.data?.initialized || false
        };
      } catch (error) {
        // Vault service not running
      }

      // Get secret statistics (if vault is running and unsealed)
      let secretStats = {
        total: 0,
        byType: {},
        recentlyAccessed: 0,
        expiringSoon: 0
      };

      if (vaultServiceHealth.running && !vaultServiceHealth.sealed) {
        try {
          const statsResponse = await axios.get(`${vaultUrl}/api/secrets/stats`, {
            timeout: 5000,
            headers: {
              'X-Vault-Token': process.env.VAULT_TOKEN || ''
            }
          });
          secretStats = statsResponse.data?.stats || secretStats;
        } catch (error) {
          // Stats not available
        }
      }

      return {
        service: {
          url: vaultUrl,
          health: vaultServiceHealth,
          autoStart: this.serviceRegistry['exprsn-vault']?.autoStart || false,
          token: process.env.VAULT_TOKEN ? '***configured***' : null
        },
        storage: {
          backend: process.env.VAULT_STORAGE_BACKEND || 'filesystem',
          encryptionAlgorithm: 'AES-256-GCM',
          path: process.env.VAULT_STORAGE_PATH || './vault/data',
          encrypted: true
        },
        secrets: secretStats,
        security: {
          auditLogging: process.env.VAULT_AUDIT_ENABLED === 'true',
          accessPolicies: process.env.VAULT_POLICIES_ENABLED === 'true',
          masterKeyRotation: process.env.VAULT_KEY_ROTATION_DAYS || 90,
          tokenTTL: process.env.VAULT_TOKEN_TTL || '768h'
        },
        integration: {
          servicesUsingVault: Object.values(this.serviceRegistry)
            .filter(s => s.dependencies && s.dependencies.includes('exprsn-ca'))
            .map(s => ({ id: s.port, name: s.name }))
        }
      };
    } catch (error) {
      throw new Error('Failed to get Vault configuration: ' + error.message);
    }
  }

  /**
   * Update Vault configuration
   * @param {Object} updates - Configuration updates
   * @returns {Promise<Object>} Update result
   */
  async updateVaultConfiguration(updates) {
    const fs = require('fs').promises;
    const path = require('path');

    try {
      const envPath = path.resolve(__dirname, '../../../.env');
      let envContent = await fs.readFile(envPath, 'utf8');

      const envUpdates = {};

      if (updates.url !== undefined) {
        envUpdates.VAULT_URL = updates.url;
      }

      if (updates.storageBackend !== undefined) {
        envUpdates.VAULT_STORAGE_BACKEND = updates.storageBackend;
      }

      if (updates.storagePath !== undefined) {
        envUpdates.VAULT_STORAGE_PATH = updates.storagePath;
      }

      if (updates.auditLogging !== undefined) {
        envUpdates.VAULT_AUDIT_ENABLED = String(updates.auditLogging);
      }

      if (updates.accessPolicies !== undefined) {
        envUpdates.VAULT_POLICIES_ENABLED = String(updates.accessPolicies);
      }

      if (updates.keyRotationDays !== undefined) {
        envUpdates.VAULT_KEY_ROTATION_DAYS = String(updates.keyRotationDays);
      }

      if (updates.tokenTTL !== undefined) {
        envUpdates.VAULT_TOKEN_TTL = updates.tokenTTL;
      }

      // Update .env file
      for (const [key, value] of Object.entries(envUpdates)) {
        const regex = new RegExp(`^${key}=.*$`, 'm');
        if (envContent.match(regex)) {
          envContent = envContent.replace(regex, `${key}=${value}`);
        } else {
          envContent += `\n${key}=${value}`;
        }
      }

      await fs.writeFile(envPath, envContent, 'utf8');

      return {
        success: true,
        message: 'Vault configuration updated successfully',
        updatedFields: Object.keys(envUpdates),
        requiresRestart: true
      };
    } catch (error) {
      throw new Error('Failed to update Vault configuration: ' + error.message);
    }
  }

  /**
   * Test Vault connection
   * @returns {Promise<Object>} Connection test result
   */
  async testVaultConnection() {
    const axios = require('axios');
    const vaultUrl = process.env.VAULT_URL || 'http://localhost:3013';

    try {
      const startTime = Date.now();

      // Test health endpoint
      const healthResponse = await axios.get(`${vaultUrl}/health`, { timeout: 5000 });
      const responseTime = Date.now() - startTime;

      // Test authentication if token is configured
      let authTest = { authenticated: false };
      if (process.env.VAULT_TOKEN) {
        try {
          const authResponse = await axios.get(`${vaultUrl}/api/auth/verify`, {
            timeout: 5000,
            headers: {
              'X-Vault-Token': process.env.VAULT_TOKEN
            }
          });
          authTest = {
            authenticated: true,
            policies: authResponse.data?.policies || [],
            ttl: authResponse.data?.ttl || null
          };
        } catch (error) {
          authTest = {
            authenticated: false,
            error: error.response?.data?.message || error.message
          };
        }
      }

      return {
        success: true,
        connection: {
          reachable: true,
          responseTime,
          version: healthResponse.data?.version || 'unknown',
          sealed: healthResponse.data?.sealed || false,
          initialized: healthResponse.data?.initialized || false
        },
        authentication: authTest
      };
    } catch (error) {
      return {
        success: false,
        error: error.message,
        connection: {
          reachable: false,
          error: error.code || 'CONNECTION_FAILED'
        }
      };
    }
  }

  /**
   * List secrets (metadata only)
   * @returns {Promise<Object>} Secrets list
   */
  async getVaultSecrets() {
    const axios = require('axios');
    const vaultUrl = process.env.VAULT_URL || 'http://localhost:3013';

    try {
      const response = await axios.get(`${vaultUrl}/api/secrets`, {
        timeout: 5000,
        headers: {
          'X-Vault-Token': process.env.VAULT_TOKEN || ''
        }
      });

      return {
        success: true,
        secrets: response.data?.secrets || []
      };
    } catch (error) {
      throw new Error('Failed to list secrets: ' + error.message);
    }
  }

  /**
   * Seal Vault
   * @returns {Promise<Object>} Seal operation result
   */
  async sealVault() {
    const axios = require('axios');
    const vaultUrl = process.env.VAULT_URL || 'http://localhost:3013';

    try {
      const response = await axios.post(`${vaultUrl}/api/sys/seal`, {}, {
        timeout: 5000,
        headers: {
          'X-Vault-Token': process.env.VAULT_TOKEN || ''
        }
      });

      return {
        success: true,
        message: 'Vault sealed successfully',
        sealed: true
      };
    } catch (error) {
      throw new Error('Failed to seal vault: ' + error.message);
    }
  }

  /**
   * Unseal Vault
   * @param {Object} params - Unseal parameters
   * @returns {Promise<Object>} Unseal operation result
   */
  async unsealVault(params) {
    const axios = require('axios');
    const vaultUrl = process.env.VAULT_URL || 'http://localhost:3013';

    try {
      const response = await axios.post(`${vaultUrl}/api/sys/unseal`, {
        key: params.unsealKey
      }, {
        timeout: 5000
      });

      return {
        success: true,
        message: 'Vault unsealed successfully',
        sealed: false,
        progress: response.data?.progress || null
      };
    } catch (error) {
      throw new Error('Failed to unseal vault: ' + error.message);
    }
  }

  /**
   * Rotate Vault master key
   * @returns {Promise<Object>} Rotation result
   */
  async rotateVaultMasterKey() {
    const axios = require('axios');
    const vaultUrl = process.env.VAULT_URL || 'http://localhost:3013';

    try {
      const response = await axios.post(`${vaultUrl}/api/sys/rotate`, {}, {
        timeout: 10000,
        headers: {
          'X-Vault-Token': process.env.VAULT_TOKEN || ''
        }
      });

      return {
        success: true,
        message: 'Master key rotation initiated successfully',
        rotationId: response.data?.rotationId || null,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      throw new Error('Failed to rotate master key: ' + error.message);
    }
  }

  // ============================================================================
  // FILEVAULT (FILE MANAGEMENT) CONFIGURATION
  // ============================================================================

  async getFileVaultConfiguration() {
    const axios = require('axios');
    const filevaultUrl = process.env.FILEVAULT_URL || 'http://localhost:3010';

    try {
      // Check FileVault service health
      let filevaultServiceHealth = {
        running: false,
        responseTime: null,
        version: null,
        storageUsed: null,
        storageAvailable: null
      };

      try {
        const startTime = Date.now();
        const response = await axios.get(`${filevaultUrl}/health`, { timeout: 5000 });
        filevaultServiceHealth = {
          running: response.status === 200,
          responseTime: Date.now() - startTime,
          version: response.data?.version || 'unknown',
          storageUsed: response.data?.storage?.used || 0,
          storageAvailable: response.data?.storage?.available || 0
        };
      } catch (error) {
        // FileVault service not running
      }

      // Get file storage statistics (would come from FileVault API in production)
      let fileStats = {
        totalFiles: 0,
        totalSize: 0,
        fileTypes: {}
      };

      return {
        service: {
          url: filevaultUrl,
          health: filevaultServiceHealth,
          autoStart: this.serviceRegistry['exprsn-filevault']?.autoStart || false,
          apiKey: process.env.FILEVAULT_API_KEY ? '***configured***' : null
        },
        storage: {
          backend: process.env.FILEVAULT_STORAGE_BACKEND || 's3',
          provider: process.env.FILEVAULT_STORAGE_PROVIDER || 'aws',
          bucket: process.env.FILEVAULT_S3_BUCKET || 'exprsn-files',
          region: process.env.FILEVAULT_S3_REGION || 'us-east-1',
          encryption: process.env.FILEVAULT_ENCRYPTION_ENABLED === 'true',
          path: process.env.FILEVAULT_STORAGE_PATH || './storage/files'
        },
        files: fileStats,
        features: {
          virusScanning: process.env.FILEVAULT_VIRUS_SCAN === 'true',
          thumbnailGeneration: process.env.FILEVAULT_THUMBNAILS === 'true',
          cdn: process.env.FILEVAULT_CDN_ENABLED === 'true',
          versioning: process.env.FILEVAULT_VERSIONING === 'true'
        },
        limits: {
          maxFileSize: process.env.FILEVAULT_MAX_FILE_SIZE || '100MB',
          allowedTypes: (process.env.FILEVAULT_ALLOWED_TYPES || '*').split(','),
          maxStoragePerUser: process.env.FILEVAULT_MAX_STORAGE_USER || '10GB'
        }
      };
    } catch (error) {
      throw new Error('Failed to get FileVault configuration: ' + error.message);
    }
  }

  async updateFileVaultConfiguration(config) {
    const fs = require('fs').promises;
    const path = require('path');
    const envPath = path.join(__dirname, '../../../.env');

    try {
      let envContent = await fs.readFile(envPath, 'utf8');
      const updates = [];

      // Update FileVault service settings
      if (config.service) {
        if (config.service.url !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_URL', config.service.url);
          updates.push('FILEVAULT_URL');
        }
        if (config.service.apiKey && config.service.apiKey !== '***configured***') {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_API_KEY', config.service.apiKey);
          updates.push('FILEVAULT_API_KEY');
        }
      }

      // Update storage settings
      if (config.storage) {
        if (config.storage.backend !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_STORAGE_BACKEND', config.storage.backend);
          updates.push('FILEVAULT_STORAGE_BACKEND');
        }
        if (config.storage.provider !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_STORAGE_PROVIDER', config.storage.provider);
          updates.push('FILEVAULT_STORAGE_PROVIDER');
        }
        if (config.storage.bucket !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_S3_BUCKET', config.storage.bucket);
          updates.push('FILEVAULT_S3_BUCKET');
        }
        if (config.storage.region !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_S3_REGION', config.storage.region);
          updates.push('FILEVAULT_S3_REGION');
        }
        if (config.storage.encryption !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_ENCRYPTION_ENABLED', config.storage.encryption.toString());
          updates.push('FILEVAULT_ENCRYPTION_ENABLED');
        }
        if (config.storage.path !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_STORAGE_PATH', config.storage.path);
          updates.push('FILEVAULT_STORAGE_PATH');
        }
      }

      // Update features
      if (config.features) {
        if (config.features.virusScanning !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_VIRUS_SCAN', config.features.virusScanning.toString());
          updates.push('FILEVAULT_VIRUS_SCAN');
        }
        if (config.features.thumbnailGeneration !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_THUMBNAILS', config.features.thumbnailGeneration.toString());
          updates.push('FILEVAULT_THUMBNAILS');
        }
        if (config.features.cdn !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_CDN_ENABLED', config.features.cdn.toString());
          updates.push('FILEVAULT_CDN_ENABLED');
        }
        if (config.features.versioning !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_VERSIONING', config.features.versioning.toString());
          updates.push('FILEVAULT_VERSIONING');
        }
      }

      // Update limits
      if (config.limits) {
        if (config.limits.maxFileSize !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_MAX_FILE_SIZE', config.limits.maxFileSize);
          updates.push('FILEVAULT_MAX_FILE_SIZE');
        }
        if (config.limits.allowedTypes !== undefined) {
          const typesString = Array.isArray(config.limits.allowedTypes)
            ? config.limits.allowedTypes.join(',')
            : config.limits.allowedTypes;
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_ALLOWED_TYPES', typesString);
          updates.push('FILEVAULT_ALLOWED_TYPES');
        }
        if (config.limits.maxStoragePerUser !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FILEVAULT_MAX_STORAGE_USER', config.limits.maxStoragePerUser);
          updates.push('FILEVAULT_MAX_STORAGE_USER');
        }
      }

      await fs.writeFile(envPath, envContent);

      return {
        success: true,
        message: 'FileVault configuration updated successfully',
        updated: updates,
        requiresRestart: updates.length > 0
      };
    } catch (error) {
      throw new Error('Failed to update FileVault configuration: ' + error.message);
    }
  }

  async testFileVaultConnection() {
    const axios = require('axios');
    const filevaultUrl = process.env.FILEVAULT_URL || 'http://localhost:3010';

    try {
      const startTime = Date.now();
      const response = await axios.get(`${filevaultUrl}/health`, {
        timeout: 5000,
        headers: {
          'X-API-Key': process.env.FILEVAULT_API_KEY || ''
        }
      });

      return {
        success: true,
        message: 'FileVault connection successful',
        responseTime: Date.now() - startTime,
        version: response.data?.version || 'unknown',
        storage: response.data?.storage || {}
      };
    } catch (error) {
      throw new Error('FileVault connection failed: ' + error.message);
    }
  }

  // ============================================================================
  // HERALD (NOTIFICATIONS) CONFIGURATION
  // ============================================================================

  async getHeraldConfiguration() {
    const axios = require('axios');
    const heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';

    try {
      // Check Herald service health
      let heraldServiceHealth = {
        running: false,
        responseTime: null,
        version: null,
        queueSize: 0,
        deliveryRate: null
      };

      try {
        const startTime = Date.now();
        const response = await axios.get(`${heraldUrl}/health`, { timeout: 5000 });
        heraldServiceHealth = {
          running: response.status === 200,
          responseTime: Date.now() - startTime,
          version: response.data?.version || 'unknown',
          queueSize: response.data?.queue?.size || 0,
          deliveryRate: response.data?.metrics?.deliveryRate || null
        };
      } catch (error) {
        // Herald service not running
      }

      // Get notification statistics
      let notificationStats = {
        totalSent: 0,
        totalFailed: 0,
        byChannel: {}
      };

      return {
        service: {
          url: heraldUrl,
          health: heraldServiceHealth,
          autoStart: this.serviceRegistry['exprsn-herald']?.autoStart || false,
          apiKey: process.env.HERALD_API_KEY ? '***configured***' : null
        },
        channels: {
          email: {
            enabled: process.env.HERALD_EMAIL_ENABLED === 'true',
            provider: process.env.HERALD_EMAIL_PROVIDER || 'smtp',
            from: process.env.HERALD_EMAIL_FROM || 'noreply@exprsn.io'
          },
          sms: {
            enabled: process.env.HERALD_SMS_ENABLED === 'true',
            provider: process.env.HERALD_SMS_PROVIDER || 'twilio',
            from: process.env.HERALD_SMS_FROM || ''
          },
          push: {
            enabled: process.env.HERALD_PUSH_ENABLED === 'true',
            provider: process.env.HERALD_PUSH_PROVIDER || 'fcm'
          },
          webhook: {
            enabled: process.env.HERALD_WEBHOOK_ENABLED === 'true'
          }
        },
        notifications: notificationStats,
        settings: {
          retryAttempts: parseInt(process.env.HERALD_RETRY_ATTEMPTS || '3'),
          retryDelay: parseInt(process.env.HERALD_RETRY_DELAY || '60'),
          batchSize: parseInt(process.env.HERALD_BATCH_SIZE || '100'),
          rateLimitPerMinute: parseInt(process.env.HERALD_RATE_LIMIT || '1000')
        },
        templates: {
          enabled: process.env.HERALD_TEMPLATES_ENABLED === 'true',
          path: process.env.HERALD_TEMPLATES_PATH || './templates'
        }
      };
    } catch (error) {
      throw new Error('Failed to get Herald configuration: ' + error.message);
    }
  }

  async updateHeraldConfiguration(config) {
    const fs = require('fs').promises;
    const path = require('path');
    const envPath = path.join(__dirname, '../../../.env');

    try {
      let envContent = await fs.readFile(envPath, 'utf8');
      const updates = [];

      // Update Herald service settings
      if (config.service) {
        if (config.service.url !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'HERALD_URL', config.service.url);
          updates.push('HERALD_URL');
        }
        if (config.service.apiKey && config.service.apiKey !== '***configured***') {
          envContent = this.updateEnvVariable(envContent, 'HERALD_API_KEY', config.service.apiKey);
          updates.push('HERALD_API_KEY');
        }
      }

      // Update channels
      if (config.channels) {
        if (config.channels.email) {
          if (config.channels.email.enabled !== undefined) {
            envContent = this.updateEnvVariable(envContent, 'HERALD_EMAIL_ENABLED', config.channels.email.enabled.toString());
            updates.push('HERALD_EMAIL_ENABLED');
          }
          if (config.channels.email.provider !== undefined) {
            envContent = this.updateEnvVariable(envContent, 'HERALD_EMAIL_PROVIDER', config.channels.email.provider);
            updates.push('HERALD_EMAIL_PROVIDER');
          }
          if (config.channels.email.from !== undefined) {
            envContent = this.updateEnvVariable(envContent, 'HERALD_EMAIL_FROM', config.channels.email.from);
            updates.push('HERALD_EMAIL_FROM');
          }
        }
        if (config.channels.sms) {
          if (config.channels.sms.enabled !== undefined) {
            envContent = this.updateEnvVariable(envContent, 'HERALD_SMS_ENABLED', config.channels.sms.enabled.toString());
            updates.push('HERALD_SMS_ENABLED');
          }
          if (config.channels.sms.provider !== undefined) {
            envContent = this.updateEnvVariable(envContent, 'HERALD_SMS_PROVIDER', config.channels.sms.provider);
            updates.push('HERALD_SMS_PROVIDER');
          }
          if (config.channels.sms.from !== undefined) {
            envContent = this.updateEnvVariable(envContent, 'HERALD_SMS_FROM', config.channels.sms.from);
            updates.push('HERALD_SMS_FROM');
          }
        }
        if (config.channels.push) {
          if (config.channels.push.enabled !== undefined) {
            envContent = this.updateEnvVariable(envContent, 'HERALD_PUSH_ENABLED', config.channels.push.enabled.toString());
            updates.push('HERALD_PUSH_ENABLED');
          }
          if (config.channels.push.provider !== undefined) {
            envContent = this.updateEnvVariable(envContent, 'HERALD_PUSH_PROVIDER', config.channels.push.provider);
            updates.push('HERALD_PUSH_PROVIDER');
          }
        }
        if (config.channels.webhook) {
          if (config.channels.webhook.enabled !== undefined) {
            envContent = this.updateEnvVariable(envContent, 'HERALD_WEBHOOK_ENABLED', config.channels.webhook.enabled.toString());
            updates.push('HERALD_WEBHOOK_ENABLED');
          }
        }
      }

      // Update settings
      if (config.settings) {
        if (config.settings.retryAttempts !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'HERALD_RETRY_ATTEMPTS', config.settings.retryAttempts.toString());
          updates.push('HERALD_RETRY_ATTEMPTS');
        }
        if (config.settings.retryDelay !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'HERALD_RETRY_DELAY', config.settings.retryDelay.toString());
          updates.push('HERALD_RETRY_DELAY');
        }
        if (config.settings.batchSize !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'HERALD_BATCH_SIZE', config.settings.batchSize.toString());
          updates.push('HERALD_BATCH_SIZE');
        }
        if (config.settings.rateLimitPerMinute !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'HERALD_RATE_LIMIT', config.settings.rateLimitPerMinute.toString());
          updates.push('HERALD_RATE_LIMIT');
        }
      }

      // Update templates
      if (config.templates) {
        if (config.templates.enabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'HERALD_TEMPLATES_ENABLED', config.templates.enabled.toString());
          updates.push('HERALD_TEMPLATES_ENABLED');
        }
        if (config.templates.path !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'HERALD_TEMPLATES_PATH', config.templates.path);
          updates.push('HERALD_TEMPLATES_PATH');
        }
      }

      await fs.writeFile(envPath, envContent);

      return {
        success: true,
        message: 'Herald configuration updated successfully',
        updated: updates,
        requiresRestart: updates.length > 0
      };
    } catch (error) {
      throw new Error('Failed to update Herald configuration: ' + error.message);
    }
  }

  async testHeraldConnection() {
    const axios = require('axios');
    const heraldUrl = process.env.HERALD_URL || 'http://localhost:3014';

    try {
      const startTime = Date.now();
      const response = await axios.get(`${heraldUrl}/health`, {
        timeout: 5000,
        headers: {
          'X-API-Key': process.env.HERALD_API_KEY || ''
        }
      });

      return {
        success: true,
        message: 'Herald connection successful',
        responseTime: Date.now() - startTime,
        version: response.data?.version || 'unknown',
        queue: response.data?.queue || {}
      };
    } catch (error) {
      throw new Error('Herald connection failed: ' + error.message);
    }
  }

  // ============================================================================
  // WORKFLOW AUTOMATION CONFIGURATION
  // ============================================================================

  async getWorkflowConfiguration() {
    const axios = require('axios');
    const workflowUrl = process.env.WORKFLOW_URL || 'http://localhost:3017';

    try {
      // Check Workflow service health
      let workflowServiceHealth = {
        running: false,
        responseTime: null,
        version: null,
        activeWorkflows: 0,
        executionsToday: 0
      };

      try {
        const startTime = Date.now();
        const response = await axios.get(`${workflowUrl}/health`, { timeout: 5000 });
        workflowServiceHealth = {
          running: response.status === 200,
          responseTime: Date.now() - startTime,
          version: response.data?.version || 'unknown',
          activeWorkflows: response.data?.stats?.active || 0,
          executionsToday: response.data?.stats?.executionsToday || 0
        };
      } catch (error) {
        // Workflow service not running
      }

      // Get workflow statistics
      let workflowStats = {
        totalWorkflows: 0,
        activeWorkflows: 0,
        totalExecutions: 0,
        successRate: 0
      };

      return {
        service: {
          url: workflowUrl,
          health: workflowServiceHealth,
          autoStart: this.serviceRegistry['exprsn-workflow']?.autoStart || false,
          apiKey: process.env.WORKFLOW_API_KEY ? '***configured***' : null
        },
        workflows: workflowStats,
        execution: {
          maxConcurrent: parseInt(process.env.WORKFLOW_MAX_CONCURRENT || '10'),
          timeout: parseInt(process.env.WORKFLOW_TIMEOUT || '300'),
          retryAttempts: parseInt(process.env.WORKFLOW_RETRY_ATTEMPTS || '3'),
          retryDelay: parseInt(process.env.WORKFLOW_RETRY_DELAY || '60')
        },
        features: {
          scheduling: process.env.WORKFLOW_SCHEDULING === 'true',
          webhooks: process.env.WORKFLOW_WEBHOOKS === 'true',
          apiIntegrations: process.env.WORKFLOW_API_INTEGRATIONS === 'true',
          conditionalLogic: process.env.WORKFLOW_CONDITIONAL_LOGIC === 'true'
        },
        storage: {
          logsEnabled: process.env.WORKFLOW_LOGS_ENABLED === 'true',
          logsRetentionDays: parseInt(process.env.WORKFLOW_LOGS_RETENTION || '30'),
          executionHistory: process.env.WORKFLOW_HISTORY_ENABLED === 'true'
        }
      };
    } catch (error) {
      throw new Error('Failed to get Workflow configuration: ' + error.message);
    }
  }

  async updateWorkflowConfiguration(config) {
    const fs = require('fs').promises;
    const path = require('path');
    const envPath = path.join(__dirname, '../../../.env');

    try {
      let envContent = await fs.readFile(envPath, 'utf8');
      const updates = [];

      // Update Workflow service settings
      if (config.service) {
        if (config.service.url !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_URL', config.service.url);
          updates.push('WORKFLOW_URL');
        }
        if (config.service.apiKey && config.service.apiKey !== '***configured***') {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_API_KEY', config.service.apiKey);
          updates.push('WORKFLOW_API_KEY');
        }
      }

      // Update execution settings
      if (config.execution) {
        if (config.execution.maxConcurrent !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_MAX_CONCURRENT', config.execution.maxConcurrent.toString());
          updates.push('WORKFLOW_MAX_CONCURRENT');
        }
        if (config.execution.timeout !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_TIMEOUT', config.execution.timeout.toString());
          updates.push('WORKFLOW_TIMEOUT');
        }
        if (config.execution.retryAttempts !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_RETRY_ATTEMPTS', config.execution.retryAttempts.toString());
          updates.push('WORKFLOW_RETRY_ATTEMPTS');
        }
        if (config.execution.retryDelay !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_RETRY_DELAY', config.execution.retryDelay.toString());
          updates.push('WORKFLOW_RETRY_DELAY');
        }
      }

      // Update features
      if (config.features) {
        if (config.features.scheduling !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_SCHEDULING', config.features.scheduling.toString());
          updates.push('WORKFLOW_SCHEDULING');
        }
        if (config.features.webhooks !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_WEBHOOKS', config.features.webhooks.toString());
          updates.push('WORKFLOW_WEBHOOKS');
        }
        if (config.features.apiIntegrations !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_API_INTEGRATIONS', config.features.apiIntegrations.toString());
          updates.push('WORKFLOW_API_INTEGRATIONS');
        }
        if (config.features.conditionalLogic !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_CONDITIONAL_LOGIC', config.features.conditionalLogic.toString());
          updates.push('WORKFLOW_CONDITIONAL_LOGIC');
        }
      }

      // Update storage settings
      if (config.storage) {
        if (config.storage.logsEnabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_LOGS_ENABLED', config.storage.logsEnabled.toString());
          updates.push('WORKFLOW_LOGS_ENABLED');
        }
        if (config.storage.logsRetentionDays !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_LOGS_RETENTION', config.storage.logsRetentionDays.toString());
          updates.push('WORKFLOW_LOGS_RETENTION');
        }
        if (config.storage.executionHistory !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOW_HISTORY_ENABLED', config.storage.executionHistory.toString());
          updates.push('WORKFLOW_HISTORY_ENABLED');
        }
      }

      await fs.writeFile(envPath, envContent);

      return {
        success: true,
        message: 'Workflow configuration updated successfully',
        updated: updates,
        requiresRestart: updates.length > 0
      };
    } catch (error) {
      throw new Error('Failed to update Workflow configuration: ' + error.message);
    }
  }

  async testWorkflowConnection() {
    const axios = require('axios');
    const workflowUrl = process.env.WORKFLOW_URL || 'http://localhost:3017';

    try {
      const startTime = Date.now();
      const response = await axios.get(`${workflowUrl}/health`, {
        timeout: 5000,
        headers: {
          'X-API-Key': process.env.WORKFLOW_API_KEY || ''
        }
      });

      return {
        success: true,
        message: 'Workflow connection successful',
        responseTime: Date.now() - startTime,
        version: response.data?.version || 'unknown',
        stats: response.data?.stats || {}
      };
    } catch (error) {
      throw new Error('Workflow connection failed: ' + error.message);
    }
  }

  // ============================================================================
  // SETUP (SERVICE DISCOVERY) CONFIGURATION
  // ============================================================================

  async getSetupConfiguration() {
    const axios = require('axios');
    const setupUrl = process.env.SETUP_URL || 'http://localhost:3015';

    try {
      // Check Setup service health
      let setupServiceHealth = {
        running: false,
        responseTime: null,
        version: null,
        registeredServices: 0,
        healthyServices: 0
      };

      try {
        const startTime = Date.now();
        const response = await axios.get(`${setupUrl}/health`, { timeout: 5000 });
        setupServiceHealth = {
          running: response.status === 200,
          responseTime: Date.now() - startTime,
          version: response.data?.version || 'unknown',
          registeredServices: response.data?.stats?.registered || 0,
          healthyServices: response.data?.stats?.healthy || 0
        };
      } catch (error) {
        // Setup service not running
      }

      return {
        service: {
          url: setupUrl,
          health: setupServiceHealth,
          autoStart: this.serviceRegistry['exprsn-setup']?.autoStart || false,
          apiKey: process.env.SETUP_API_KEY ? '***configured***' : null
        },
        discovery: {
          enabled: process.env.SETUP_DISCOVERY_ENABLED === 'true',
          heartbeatInterval: parseInt(process.env.SETUP_HEARTBEAT_INTERVAL || '30'),
          healthCheckInterval: parseInt(process.env.SETUP_HEALTH_CHECK_INTERVAL || '60'),
          timeout: parseInt(process.env.SETUP_DISCOVERY_TIMEOUT || '5')
        },
        registry: {
          persistToDatabase: process.env.SETUP_PERSIST_REGISTRY === 'true',
          cacheEnabled: process.env.SETUP_CACHE_ENABLED === 'true',
          cacheTTL: parseInt(process.env.SETUP_CACHE_TTL || '300')
        },
        monitoring: {
          metricsEnabled: process.env.SETUP_METRICS_ENABLED === 'true',
          alertsEnabled: process.env.SETUP_ALERTS_ENABLED === 'true',
          alertEmail: process.env.SETUP_ALERT_EMAIL || '',
          dashboardEnabled: process.env.SETUP_DASHBOARD_ENABLED === 'true'
        }
      };
    } catch (error) {
      throw new Error('Failed to get Setup configuration: ' + error.message);
    }
  }

  async updateSetupConfiguration(config) {
    const fs = require('fs').promises;
    const path = require('path');
    const envPath = path.join(__dirname, '../../../.env');

    try {
      let envContent = await fs.readFile(envPath, 'utf8');
      const updates = [];

      // Update Setup service settings
      if (config.service) {
        if (config.service.url !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_URL', config.service.url);
          updates.push('SETUP_URL');
        }
        if (config.service.apiKey && config.service.apiKey !== '***configured***') {
          envContent = this.updateEnvVariable(envContent, 'SETUP_API_KEY', config.service.apiKey);
          updates.push('SETUP_API_KEY');
        }
      }

      // Update discovery settings
      if (config.discovery) {
        if (config.discovery.enabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_DISCOVERY_ENABLED', config.discovery.enabled.toString());
          updates.push('SETUP_DISCOVERY_ENABLED');
        }
        if (config.discovery.heartbeatInterval !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_HEARTBEAT_INTERVAL', config.discovery.heartbeatInterval.toString());
          updates.push('SETUP_HEARTBEAT_INTERVAL');
        }
        if (config.discovery.healthCheckInterval !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_HEALTH_CHECK_INTERVAL', config.discovery.healthCheckInterval.toString());
          updates.push('SETUP_HEALTH_CHECK_INTERVAL');
        }
        if (config.discovery.timeout !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_DISCOVERY_TIMEOUT', config.discovery.timeout.toString());
          updates.push('SETUP_DISCOVERY_TIMEOUT');
        }
      }

      // Update registry settings
      if (config.registry) {
        if (config.registry.persistToDatabase !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_PERSIST_REGISTRY', config.registry.persistToDatabase.toString());
          updates.push('SETUP_PERSIST_REGISTRY');
        }
        if (config.registry.cacheEnabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_CACHE_ENABLED', config.registry.cacheEnabled.toString());
          updates.push('SETUP_CACHE_ENABLED');
        }
        if (config.registry.cacheTTL !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_CACHE_TTL', config.registry.cacheTTL.toString());
          updates.push('SETUP_CACHE_TTL');
        }
      }

      // Update monitoring settings
      if (config.monitoring) {
        if (config.monitoring.metricsEnabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_METRICS_ENABLED', config.monitoring.metricsEnabled.toString());
          updates.push('SETUP_METRICS_ENABLED');
        }
        if (config.monitoring.alertsEnabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_ALERTS_ENABLED', config.monitoring.alertsEnabled.toString());
          updates.push('SETUP_ALERTS_ENABLED');
        }
        if (config.monitoring.alertEmail !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_ALERT_EMAIL', config.monitoring.alertEmail);
          updates.push('SETUP_ALERT_EMAIL');
        }
        if (config.monitoring.dashboardEnabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SETUP_DASHBOARD_ENABLED', config.monitoring.dashboardEnabled.toString());
          updates.push('SETUP_DASHBOARD_ENABLED');
        }
      }

      await fs.writeFile(envPath, envContent);

      return {
        success: true,
        message: 'Setup configuration updated successfully',
        updated: updates,
        requiresRestart: updates.length > 0
      };
    } catch (error) {
      throw new Error('Failed to update Setup configuration: ' + error.message);
    }
  }

  async testSetupConnection() {
    const axios = require('axios');
    const setupUrl = process.env.SETUP_URL || 'http://localhost:3015';

    try {
      const startTime = Date.now();
      const response = await axios.get(`${setupUrl}/health`, {
        timeout: 5000,
        headers: {
          'X-API-Key': process.env.SETUP_API_KEY || ''
        }
      });

      return {
        success: true,
        message: 'Setup service connection successful',
        responseTime: Date.now() - startTime,
        version: response.data?.version || 'unknown',
        stats: response.data?.stats || {}
      };
    } catch (error) {
      throw new Error('Setup connection failed: ' + error.message);
    }
  }

  // ============================================================================
  // BUSINESS HUB (EXPRSN-SVR) CONFIGURATION
  // ============================================================================

  async getBusinessHubConfiguration() {
    try {
      // Get current server configuration
      const businessHubHealth = {
        running: true, // We're running this code, so server is running
        port: process.env.PORT || 5001,
        protocol: process.env.TLS_ENABLED === 'true' ? 'https' : 'http',
        environment: process.env.NODE_ENV || 'development'
      };

      return {
        service: {
          health: businessHubHealth,
          autoStart: true, // Always auto-start (it's the main service)
          devAuthEnabled: process.env.LOW_CODE_DEV_AUTH === 'true'
        },
        lowcode: {
          enabled: true, // Always enabled in exprsn-svr
          basePath: '/lowcode',
          entityDesigner: process.env.LOWCODE_ENTITY_DESIGNER_ENABLED !== 'false',
          formDesigner: process.env.LOWCODE_FORM_DESIGNER_ENABLED !== 'false',
          gridDesigner: process.env.LOWCODE_GRID_DESIGNER_ENABLED !== 'false',
          apiBuilder: process.env.LOWCODE_API_BUILDER_ENABLED !== 'false'
        },
        forge: {
          enabled: process.env.FORGE_ENABLED !== 'false',
          basePath: '/forge',
          crm: {
            enabled: process.env.FORGE_CRM_ENABLED !== 'false',
            modules: ['contacts', 'accounts', 'leads', 'opportunities', 'cases', 'tasks']
          },
          erp: {
            enabled: process.env.FORGE_ERP_ENABLED !== 'false',
            modules: ['financials', 'inventory', 'hr', 'assets', 'reporting']
          },
          groupware: {
            enabled: process.env.FORGE_GROUPWARE_ENABLED !== 'false',
            modules: ['calendar', 'email', 'tasks', 'documents']
          }
        },
        database: {
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          name: process.env.DB_NAME || 'exprsn_svr',
          poolSize: parseInt(process.env.DB_POOL_SIZE || '10')
        },
        redis: {
          enabled: process.env.REDIS_ENABLED === 'true',
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379')
        },
        features: {
          socketIO: process.env.SOCKET_IO_ENABLED !== 'false',
          plugins: process.env.PLUGINS_ENABLED !== 'false',
          workflows: process.env.WORKFLOWS_INTEGRATION_ENABLED !== 'false',
          notifications: process.env.NOTIFICATIONS_INTEGRATION_ENABLED !== 'false'
        }
      };
    } catch (error) {
      throw new Error('Failed to get Business Hub configuration: ' + error.message);
    }
  }

  async updateBusinessHubConfiguration(config) {
    const fs = require('fs').promises;
    const path = require('path');
    const envPath = path.join(__dirname, '../../../.env');

    try {
      let envContent = await fs.readFile(envPath, 'utf8');
      const updates = [];

      // Update service settings
      if (config.service) {
        if (config.service.devAuthEnabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'LOW_CODE_DEV_AUTH', config.service.devAuthEnabled.toString());
          updates.push('LOW_CODE_DEV_AUTH');
        }
      }

      // Update Low-Code settings
      if (config.lowcode) {
        if (config.lowcode.entityDesigner !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'LOWCODE_ENTITY_DESIGNER_ENABLED', config.lowcode.entityDesigner.toString());
          updates.push('LOWCODE_ENTITY_DESIGNER_ENABLED');
        }
        if (config.lowcode.formDesigner !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'LOWCODE_FORM_DESIGNER_ENABLED', config.lowcode.formDesigner.toString());
          updates.push('LOWCODE_FORM_DESIGNER_ENABLED');
        }
        if (config.lowcode.gridDesigner !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'LOWCODE_GRID_DESIGNER_ENABLED', config.lowcode.gridDesigner.toString());
          updates.push('LOWCODE_GRID_DESIGNER_ENABLED');
        }
        if (config.lowcode.apiBuilder !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'LOWCODE_API_BUILDER_ENABLED', config.lowcode.apiBuilder.toString());
          updates.push('LOWCODE_API_BUILDER_ENABLED');
        }
      }

      // Update Forge settings
      if (config.forge) {
        if (config.forge.enabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FORGE_ENABLED', config.forge.enabled.toString());
          updates.push('FORGE_ENABLED');
        }
        if (config.forge.crm?.enabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FORGE_CRM_ENABLED', config.forge.crm.enabled.toString());
          updates.push('FORGE_CRM_ENABLED');
        }
        if (config.forge.erp?.enabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FORGE_ERP_ENABLED', config.forge.erp.enabled.toString());
          updates.push('FORGE_ERP_ENABLED');
        }
        if (config.forge.groupware?.enabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'FORGE_GROUPWARE_ENABLED', config.forge.groupware.enabled.toString());
          updates.push('FORGE_GROUPWARE_ENABLED');
        }
      }

      // Update database settings
      if (config.database) {
        if (config.database.host !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'DB_HOST', config.database.host);
          updates.push('DB_HOST');
        }
        if (config.database.port !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'DB_PORT', config.database.port.toString());
          updates.push('DB_PORT');
        }
        if (config.database.name !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'DB_NAME', config.database.name);
          updates.push('DB_NAME');
        }
        if (config.database.poolSize !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'DB_POOL_SIZE', config.database.poolSize.toString());
          updates.push('DB_POOL_SIZE');
        }
      }

      // Update Redis settings
      if (config.redis) {
        if (config.redis.enabled !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'REDIS_ENABLED', config.redis.enabled.toString());
          updates.push('REDIS_ENABLED');
        }
        if (config.redis.host !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'REDIS_HOST', config.redis.host);
          updates.push('REDIS_HOST');
        }
        if (config.redis.port !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'REDIS_PORT', config.redis.port.toString());
          updates.push('REDIS_PORT');
        }
      }

      // Update features
      if (config.features) {
        if (config.features.socketIO !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'SOCKET_IO_ENABLED', config.features.socketIO.toString());
          updates.push('SOCKET_IO_ENABLED');
        }
        if (config.features.plugins !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'PLUGINS_ENABLED', config.features.plugins.toString());
          updates.push('PLUGINS_ENABLED');
        }
        if (config.features.workflows !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'WORKFLOWS_INTEGRATION_ENABLED', config.features.workflows.toString());
          updates.push('WORKFLOWS_INTEGRATION_ENABLED');
        }
        if (config.features.notifications !== undefined) {
          envContent = this.updateEnvVariable(envContent, 'NOTIFICATIONS_INTEGRATION_ENABLED', config.features.notifications.toString());
          updates.push('NOTIFICATIONS_INTEGRATION_ENABLED');
        }
      }

      await fs.writeFile(envPath, envContent);

      return {
        success: true,
        message: 'Business Hub configuration updated successfully',
        updated: updates,
        requiresRestart: updates.length > 0
      };
    } catch (error) {
      throw new Error('Failed to update Business Hub configuration: ' + error.message);
    }
  }
}

module.exports = new SetupConfigService();
