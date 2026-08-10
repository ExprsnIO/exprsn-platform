/**
 * ═══════════════════════════════════════════════════════════════════════
 * Migration: Create Service Configurations Table
 * Stores configuration for all Exprsn services
 * ═══════════════════════════════════════════════════════════════════════
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('service_configurations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },

      // Service identification
      service_id: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },

      service_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },

      // Service status
      enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },

      status: {
        type: Sequelize.ENUM('not_configured', 'configured', 'running', 'stopped', 'error'),
        defaultValue: 'not_configured'
      },

      // Port configuration
      port: {
        type: Sequelize.INTEGER,
        allowNull: true
      },

      // Database configuration
      database_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },

      database_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },

      // Redis configuration
      redis_enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },

      redis_prefix: {
        type: Sequelize.STRING(50),
        allowNull: true
      },

      // Configuration sections
      config: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },

      // Environment variables
      env_vars: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },

      // Feature flags
      features: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },

      // Health check configuration
      health_check_url: {
        type: Sequelize.STRING(255),
        allowNull: true
      },

      health_check_interval: {
        type: Sequelize.INTEGER,
        defaultValue: 30000
      },

      // Dependencies
      dependencies: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true
      },

      // Metadata
      version: {
        type: Sequelize.STRING(20),
        allowNull: true
      },

      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      setup_completed: {
        type: Sequelize.BOOLEAN,
        defaultValue: false
      },

      setup_steps: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: '{}'
      },

      // Audit fields
      last_configured_at: {
        type: Sequelize.DATE,
        allowNull: true
      },

      last_configured_by: {
        type: Sequelize.UUID,
        allowNull: true
      },

      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },

      // Timestamps
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },

      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Create indexes
    await queryInterface.addIndex('service_configurations', ['service_id'], {
      unique: true,
      name: 'service_configurations_service_id_idx'
    });

    await queryInterface.addIndex('service_configurations', ['enabled'], {
      name: 'service_configurations_enabled_idx'
    });

    await queryInterface.addIndex('service_configurations', ['status'], {
      name: 'service_configurations_status_idx'
    });

    await queryInterface.addIndex('service_configurations', ['setup_completed'], {
      name: 'service_configurations_setup_completed_idx'
    });

    // Seed default service configurations
    const services = [
      {
        service_id: 'ca',
        service_name: 'Certificate Authority',
        port: 3000,
        database_enabled: true,
        database_name: 'exprsn_ca',
        redis_enabled: true,
        redis_prefix: 'ca:',
        dependencies: [],
        description: 'X.509 Certificate Authority with OCSP and CRL support',
        health_check_url: 'http://localhost:3000/health'
      },
      {
        service_id: 'auth',
        service_name: 'Authentication & SSO',
        port: 3001,
        database_enabled: true,
        database_name: 'exprsn_auth',
        redis_enabled: true,
        redis_prefix: 'auth:',
        dependencies: ['ca'],
        description: 'OAuth2/OIDC provider with SAML SSO and MFA support',
        health_check_url: 'http://localhost:3001/health'
      },
      {
        service_id: 'spark',
        service_name: 'Real-time Messaging',
        port: 3002,
        database_enabled: true,
        database_name: 'exprsn_spark',
        redis_enabled: true,
        redis_prefix: 'spark:',
        dependencies: ['ca', 'auth'],
        description: 'Real-time messaging with E2EE support',
        health_check_url: 'http://localhost:3002/health'
      },
      {
        service_id: 'timeline',
        service_name: 'Social Feed',
        port: 3004,
        database_enabled: true,
        database_name: 'exprsn_timeline',
        redis_enabled: true,
        redis_prefix: 'timeline:',
        dependencies: ['ca', 'auth'],
        description: 'Social timeline with Bull queue processing',
        health_check_url: 'http://localhost:3004/health'
      },
      {
        service_id: 'prefetch',
        service_name: 'Timeline Prefetching',
        port: 3005,
        database_enabled: false,
        redis_enabled: true,
        redis_prefix: 'prefetch:',
        dependencies: ['timeline'],
        description: 'Timeline caching and prefetching service',
        health_check_url: 'http://localhost:3005/health'
      },
      {
        service_id: 'moderator',
        service_name: 'Content Moderation',
        port: 3006,
        database_enabled: true,
        database_name: 'exprsn_moderator',
        redis_enabled: true,
        redis_prefix: 'moderator:',
        dependencies: ['ca', 'auth'],
        description: 'AI-powered content moderation',
        health_check_url: 'http://localhost:3006/health'
      },
      {
        service_id: 'filevault',
        service_name: 'File Storage',
        port: 3007,
        database_enabled: true,
        database_name: 'exprsn_filevault',
        redis_enabled: true,
        redis_prefix: 'filevault:',
        dependencies: ['ca', 'auth'],
        description: 'File storage with S3/Disk/IPFS backends',
        health_check_url: 'http://localhost:3007/health'
      },
      {
        service_id: 'gallery',
        service_name: 'Media Galleries',
        port: 3008,
        database_enabled: true,
        database_name: 'exprsn_gallery',
        redis_enabled: true,
        redis_prefix: 'gallery:',
        dependencies: ['ca', 'auth', 'filevault'],
        description: 'Media galleries with AI tagging and face detection',
        health_check_url: 'http://localhost:3008/health'
      },
      {
        service_id: 'live',
        service_name: 'Live Streaming',
        port: 3009,
        database_enabled: true,
        database_name: 'exprsn_live',
        redis_enabled: true,
        redis_prefix: 'live:',
        dependencies: ['ca', 'auth'],
        description: 'Live streaming with WebRTC signaling',
        health_check_url: 'http://localhost:3009/health'
      },
      {
        service_id: 'bridge',
        service_name: 'API Gateway',
        port: 3010,
        database_enabled: false,
        redis_enabled: true,
        redis_prefix: 'bridge:',
        dependencies: ['ca'],
        description: 'API gateway with rate limiting and lexicon routing',
        health_check_url: 'http://localhost:3010/health'
      },
      {
        service_id: 'nexus',
        service_name: 'Groups & Events',
        port: 3011,
        database_enabled: true,
        database_name: 'exprsn_nexus',
        redis_enabled: true,
        redis_prefix: 'nexus:',
        dependencies: ['ca', 'auth'],
        description: 'Groups, events, CalDAV/CardDAV',
        health_check_url: 'http://localhost:3011/health'
      },
      {
        service_id: 'pulse',
        service_name: 'Analytics & Metrics',
        port: 3012,
        database_enabled: true,
        database_name: 'exprsn_pulse',
        redis_enabled: true,
        redis_prefix: 'pulse:',
        dependencies: ['ca', 'auth'],
        description: 'Analytics and metrics collection',
        health_check_url: 'http://localhost:3012/health'
      },
      {
        service_id: 'vault',
        service_name: 'Secrets Management',
        port: 3013,
        database_enabled: true,
        database_name: 'exprsn_vault',
        redis_enabled: true,
        redis_prefix: 'vault:',
        dependencies: ['ca', 'auth'],
        description: 'Secrets management with encryption at rest',
        health_check_url: 'http://localhost:3013/health'
      },
      {
        service_id: 'herald',
        service_name: 'Notifications & Alerts',
        port: 3014,
        database_enabled: true,
        database_name: 'exprsn_herald',
        redis_enabled: true,
        redis_prefix: 'herald:',
        dependencies: ['ca', 'auth'],
        description: 'Multi-channel notification delivery',
        health_check_url: 'http://localhost:3014/health'
      },
      {
        service_id: 'setup',
        service_name: 'Setup & Management',
        port: 3015,
        database_enabled: true,
        database_name: 'exprsn_setup',
        redis_enabled: true,
        redis_prefix: 'setup:',
        dependencies: [],
        description: 'Service discovery, health monitoring, and configuration',
        health_check_url: 'http://localhost:3015/health'
      },
      {
        service_id: 'forge',
        service_name: 'Business Platform',
        port: 3016,
        database_enabled: true,
        database_name: 'exprsn_forge',
        redis_enabled: true,
        redis_prefix: 'forge:',
        dependencies: ['ca', 'auth'],
        description: 'CRM, Groupware, and ERP modules',
        health_check_url: 'http://localhost:3016/health'
      },
      {
        service_id: 'workflow',
        service_name: 'Workflow Automation',
        port: 3017,
        database_enabled: true,
        database_name: 'exprsn_workflow',
        redis_enabled: true,
        redis_prefix: 'workflow:',
        dependencies: ['ca', 'auth'],
        description: 'Visual workflow automation with 15 step types',
        health_check_url: 'http://localhost:3017/health'
      },
      {
        service_id: 'svr',
        service_name: 'Dynamic Page Server',
        port: 5000,
        database_enabled: true,
        database_name: 'exprsn_svr',
        redis_enabled: true,
        redis_prefix: 'svr:',
        dependencies: ['ca', 'auth'],
        description: 'Dynamic page server with Low-Code Platform',
        health_check_url: 'http://localhost:5000/health'
      }
    ];

    const now = new Date();
    const serviceRecords = services.map(service => ({
      ...service,
      id: Sequelize.literal('uuid_generate_v4()'),
      enabled: true,
      status: 'not_configured',
      config: '{}',
      env_vars: '{}',
      features: '{}',
      setup_steps: '{}',
      created_at: now,
      updated_at: now
    }));

    await queryInterface.bulkInsert('service_configurations', serviceRecords);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('service_configurations');
  }
};
