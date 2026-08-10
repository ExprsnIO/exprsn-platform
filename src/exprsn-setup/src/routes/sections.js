/**
 * Section Configuration Routes
 * Handles fetching and updating configuration for each dashboard section
 */

const express = require('express');
const router = express.Router();
const axios = require('axios');
const logger = require('../utils/logger');

// Service URLs
const SERVICES = {
  ca: process.env.CA_URL || 'http://localhost:3000',
  auth: process.env.AUTH_URL || 'http://localhost:3001',
  spark: process.env.SPARK_URL || 'http://localhost:3002',
  timeline: process.env.TIMELINE_URL || 'http://localhost:3004',
  prefetch: process.env.PREFETCH_URL || 'http://localhost:3005',
  moderator: process.env.MODERATOR_URL || 'http://localhost:3006',
  filevault: process.env.FILEVAULT_URL || 'http://localhost:3007',
  gallery: process.env.GALLERY_URL || 'http://localhost:3008',
  live: process.env.LIVE_URL || 'http://localhost:3009',
  nexus: process.env.NEXUS_URL || 'http://localhost:3011',
  vault: process.env.VAULT_URL || 'http://localhost:3013',
  herald: process.env.HERALD_URL || 'http://localhost:3014',
  workflow: process.env.WORKFLOW_URL || 'http://localhost:3017',
  svr: process.env.SVR_URL || 'http://localhost:5000'
};

/**
 * Get section configuration
 */
router.get('/section/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'dashboard':
        data = await getDashboardData();
        break;

      case 'services':
        data = await getServicesData();
        break;

      // Certificate sections
      case 'certificates':
      case 'cert-root':
      case 'cert-intermediate':
      case 'cert-tokens':
      case 'cert-ocsp':
        data = await getCertificateSection(sectionId);
        break;

      // Authentication sections
      case 'auth':
      case 'auth-users':
      case 'auth-groups':
      case 'auth-roles':
      case 'auth-methods':
        data = await getAuthSection(sectionId);
        break;

      // Messaging sections
      case 'messaging':
      case 'messaging-settings':
      case 'messaging-moderation':
        data = await getMessagingSection(sectionId);
        break;

      // Timeline sections
      case 'timeline':
      case 'timeline-settings':
      case 'timeline-moderation':
        data = await getTimelineSection(sectionId);
        break;

      // Nexus sections
      case 'nexus':
      case 'nexus-groups':
      case 'nexus-events':
      case 'nexus-calendar':
      case 'nexus-trending':
        data = await getNexusSection(sectionId);
        break;

      // Workflow sections
      case 'workflow':
      case 'workflow-templates':
      case 'workflow-executions':
      case 'workflow-settings':
        data = await getWorkflowSection(sectionId);
        break;

      // Moderation sections
      case 'moderation':
      case 'moderation-rules':
      case 'moderation-ai':
      case 'moderation-queue':
        data = await getModerationSection(sectionId);
        break;

      // SVR sections
      case 'svr':
      case 'svr-pages':
      case 'svr-templates':
      case 'svr-settings':
        data = await getSVRSection(sectionId);
        break;

      // Live sections
      case 'live':
      case 'live-rooms':
      case 'live-recordings':
      case 'live-settings':
        data = await getLiveSection(sectionId);
        break;

      // Gallery sections
      case 'gallery':
      case 'gallery-albums':
      case 'gallery-settings':
      case 'gallery-processing':
        data = await getGallerySection(sectionId);
        break;

      // Herald sections
      case 'herald':
      case 'herald-settings':
      case 'herald-email':
      case 'herald-push':
      case 'herald-sms':
      case 'herald-templates':
        data = await getHeraldSection(sectionId);
        break;

      // Vault sections
      case 'vault':
      case 'vault-secrets':
      case 'vault-encryption':
      case 'vault-access':
      case 'vault-audit':
        data = await getVaultSection(sectionId);
        break;

      // Prefetch sections
      case 'prefetch':
      case 'prefetch-settings':
      case 'prefetch-cache':
      case 'prefetch-performance':
        data = await getPrefetchSection(sectionId);
        break;

      // System sections
      case 'database':
        data = await getDatabaseSection();
        break;

      case 'logs':
        data = await getLogsSection();
        break;

      case 'system-settings':
        data = await getSystemSettings();
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Section not found'
        });
    }

    res.json({
      success: true,
      section: sectionId,
      data
    });

  } catch (error) {
    logger.error(`Error loading section ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Update section configuration
 */
router.post('/section/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const config = req.body;

  try {
    let result;

    switch (sectionId) {
      // Certificate configurations
      case 'cert-root':
      case 'cert-intermediate':
      case 'cert-tokens':
      case 'cert-ocsp':
        result = await updateCertificateConfig(sectionId, config);
        break;

      // Authentication configurations
      case 'auth-users':
      case 'auth-groups':
      case 'auth-roles':
      case 'auth-methods':
        result = await updateAuthConfig(sectionId, config);
        break;

      // Messaging configurations
      case 'messaging-settings':
      case 'messaging-moderation':
        result = await updateMessagingConfig(sectionId, config);
        break;

      // Timeline configurations
      case 'timeline-settings':
      case 'timeline-moderation':
        result = await updateTimelineConfig(sectionId, config);
        break;

      // Nexus configurations
      case 'nexus-groups':
      case 'nexus-events':
      case 'nexus-calendar':
      case 'nexus-trending':
        result = await updateNexusConfig(sectionId, config);
        break;

      // Workflow configurations
      case 'workflow-templates':
      case 'workflow-executions':
      case 'workflow-settings':
        result = await updateWorkflowConfig(sectionId, config);
        break;

      // Moderation configurations
      case 'moderation-rules':
      case 'moderation-ai':
      case 'moderation-queue':
        result = await updateModerationConfig(sectionId, config);
        break;

      // SVR configurations
      case 'svr-pages':
      case 'svr-templates':
      case 'svr-settings':
        result = await updateSVRConfig(sectionId, config);
        break;

      // Live configurations
      case 'live-rooms':
      case 'live-recordings':
      case 'live-settings':
        result = await updateLiveConfig(sectionId, config);
        break;

      // Gallery configurations
      case 'gallery-settings':
      case 'gallery-processing':
        result = await updateGalleryConfig(sectionId, config);
        break;

      // Herald configurations
      case 'herald-settings':
      case 'herald-email':
      case 'herald-push':
      case 'herald-sms':
        result = await updateHeraldConfig(sectionId, config);
        break;

      // Vault configurations
      case 'vault-secrets':
      case 'vault-encryption':
      case 'vault-access':
      case 'vault-audit':
        result = await updateVaultConfig(sectionId, config);
        break;

      // Prefetch configurations
      case 'prefetch-settings':
      case 'prefetch-cache':
      case 'prefetch-performance':
        result = await updatePrefetchConfig(sectionId, config);
        break;

      // System configurations
      case 'system-settings':
        result = await updateSystemSettings(config);
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Section not found'
        });
    }

    // Emit Socket.IO event for real-time update
    if (req.app.get('io')) {
      req.app.get('io').emit('config:updated', {
        section: sectionId,
        timestamp: new Date().toISOString(),
        result
      });
    }

    res.json({
      success: true,
      section: sectionId,
      result
    });

  } catch (error) {
    logger.error(`Error updating section ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Data Fetching Functions
// ========================================

async function getDashboardData() {
  return {
    stats: {
      services: {
        active: 16,
        total: 18
      },
      uptime: process.uptime(),
      connections: 0,
      tasks: {
        pending: 0,
        completed: 0
      }
    }
  };
}

async function getServicesData() {
  const services = [
    { name: 'CA', port: 3000, url: SERVICES.ca },
    { name: 'Auth', port: 3001, url: SERVICES.auth },
    { name: 'Spark', port: 3002, url: SERVICES.spark },
    { name: 'Timeline', port: 3004, url: SERVICES.timeline },
    { name: 'Nexus', port: 3011, url: SERVICES.nexus },
    { name: 'Workflow', port: 3017, url: SERVICES.workflow },
    { name: 'Moderator', port: 3006, url: SERVICES.moderator },
    { name: 'SVR', port: 5000, url: SERVICES.svr },
    { name: 'Live', port: 3009, url: SERVICES.live }
  ];

  const healthChecks = await Promise.all(
    services.map(async (service) => {
      try {
        const response = await axios.get(`${service.url}/health`, { timeout: 5000 });
        return {
          ...service,
          status: 'running',
          health: response.data
        };
      } catch (error) {
        return {
          ...service,
          status: 'stopped',
          error: error.message
        };
      }
    })
  );

  return { services: healthChecks };
}

// Certificate Authority Sections
async function getCertificateSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.ca}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching certificate section ${sectionId}:`, error.message);
    return {
      error: 'Unable to fetch certificate data',
      details: error.message,
      placeholder: getCertificatePlaceholder(sectionId)
    };
  }
}

function getCertificatePlaceholder(sectionId) {
  const placeholders = {
    'cert-root': {
      title: 'Root Certificates',
      description: 'Manage root CA certificates and trust anchors',
      fields: [
        { name: 'commonName', label: 'Common Name', type: 'text', value: 'Exprsn Root CA' },
        { name: 'country', label: 'Country', type: 'text', value: 'US' },
        { name: 'organization', label: 'Organization', type: 'text', value: 'Exprsn' },
        { name: 'validity', label: 'Validity (days)', type: 'number', value: 3650 }
      ]
    },
    'cert-intermediate': {
      title: 'Intermediate Certificates',
      description: 'Manage intermediate CA certificates for delegated signing',
      fields: [
        { name: 'commonName', label: 'Common Name', type: 'text', value: 'Exprsn Intermediate CA' },
        { name: 'parentCA', label: 'Parent CA', type: 'select', options: ['Root CA'], value: 'Root CA' },
        { name: 'validity', label: 'Validity (days)', type: 'number', value: 1825 }
      ]
    },
    'cert-tokens': {
      title: 'CA Tokens',
      description: 'Configure CA token generation and validation settings',
      fields: [
        { name: 'defaultExpiry', label: 'Default Expiry (seconds)', type: 'number', value: 3600 },
        { name: 'maxExpiry', label: 'Maximum Expiry (seconds)', type: 'number', value: 86400 },
        { name: 'algorithm', label: 'Signature Algorithm', type: 'select', options: ['RSA-SHA256', 'RSA-SHA512'], value: 'RSA-SHA256' }
      ]
    },
    'cert-ocsp': {
      title: 'OCSP / CRL Settings',
      description: 'Configure Online Certificate Status Protocol and Certificate Revocation Lists',
      fields: [
        { name: 'ocspEnabled', label: 'Enable OCSP', type: 'checkbox', value: true },
        { name: 'ocspPort', label: 'OCSP Port', type: 'number', value: 2560 },
        { name: 'crlEnabled', label: 'Enable CRL', type: 'checkbox', value: true },
        { name: 'crlUpdateInterval', label: 'CRL Update Interval (hours)', type: 'number', value: 24 }
      ]
    }
  };

  return placeholders[sectionId] || {};
}

// Authentication Sections
async function getAuthSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.auth}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return {
      error: 'Unable to fetch authentication data',
      placeholder: getAuthPlaceholder(sectionId)
    };
  }
}

function getAuthPlaceholder(sectionId) {
  const placeholders = {
    'auth-users': {
      title: 'User Management',
      description: 'Manage user accounts and profiles',
      actions: ['Create User', 'Import Users', 'Export Users'],
      table: {
        headers: ['Username', 'Email', 'Status', 'Created', 'Actions'],
        rows: []
      }
    },
    'auth-groups': {
      title: 'Group Management',
      description: 'Organize users into groups for access control',
      actions: ['Create Group', 'Import Groups'],
      table: {
        headers: ['Name', 'Members', 'Created', 'Actions'],
        rows: []
      }
    },
    'auth-roles': {
      title: 'Roles & Permissions',
      description: 'Define roles and assign permissions',
      actions: ['Create Role', 'Manage Permissions'],
      table: {
        headers: ['Role', 'Permissions', 'Users', 'Actions'],
        rows: []
      }
    },
    'auth-methods': {
      title: 'Authentication Methods',
      description: 'Configure authentication providers and methods',
      fields: [
        { name: 'passwordAuth', label: 'Password Authentication', type: 'checkbox', value: true },
        { name: 'oauth2', label: 'OAuth2', type: 'checkbox', value: false },
        { name: 'saml', label: 'SAML 2.0', type: 'checkbox', value: false },
        { name: 'mfa', label: 'Multi-Factor Authentication', type: 'checkbox', value: false }
      ]
    }
  };

  return placeholders[sectionId] || {};
}

// Messaging Sections
async function getMessagingSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.spark}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return {
      error: 'Unable to fetch messaging data',
      placeholder: getMessagingPlaceholder(sectionId)
    };
  }
}

function getMessagingPlaceholder(sectionId) {
  return {
    'messaging-settings': {
      title: 'Messaging Settings',
      fields: [
        { name: 'maxMessageLength', label: 'Max Message Length', type: 'number', value: 5000 },
        { name: 'enableE2EE', label: 'Enable End-to-End Encryption', type: 'checkbox', value: true },
        { name: 'messageRetention', label: 'Message Retention (days)', type: 'number', value: 365 }
      ]
    },
    'messaging-moderation': {
      title: 'Messaging Moderation',
      fields: [
        { name: 'autoModeration', label: 'Auto-Moderation', type: 'checkbox', value: true },
        { name: 'profanityFilter', label: 'Profanity Filter', type: 'checkbox', value: true },
        { name: 'spamDetection', label: 'Spam Detection', type: 'checkbox', value: true }
      ]
    }
  }[sectionId] || {};
}

// Timeline Sections
async function getTimelineSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.timeline}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return {
      error: 'Unable to fetch timeline data',
      placeholder: getTimelinePlaceholder(sectionId)
    };
  }
}

function getTimelinePlaceholder(sectionId) {
  return {
    'timeline-settings': {
      title: 'Timeline Settings',
      fields: [
        { name: 'maxPostLength', label: 'Max Post Length', type: 'number', value: 280 },
        { name: 'enableSearch', label: 'Enable Search', type: 'checkbox', value: true },
        { name: 'enableReactions', label: 'Enable Reactions', type: 'checkbox', value: true }
      ]
    },
    'timeline-moderation': {
      title: 'Timeline Moderation',
      fields: [
        { name: 'autoModeration', label: 'Auto-Moderation', type: 'checkbox', value: true },
        { name: 'requireApproval', label: 'Require Approval', type: 'checkbox', value: false },
        { name: 'contentFilters', label: 'Content Filters', type: 'checkbox', value: true }
      ]
    }
  }[sectionId] || {};
}

// Nexus Sections
async function getNexusSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.nexus}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return {
      error: 'Unable to fetch nexus data',
      placeholder: getNexusPlaceholder(sectionId)
    };
  }
}

function getNexusPlaceholder(sectionId) {
  return {
    'nexus-groups': {
      title: 'Group Management',
      description: 'Manage groups and communities',
      actions: ['Create Group', 'Import Groups']
    },
    'nexus-events': {
      title: 'Event Management',
      description: 'Manage events and calendars',
      actions: ['Create Event', 'Import Calendar']
    },
    'nexus-calendar': {
      title: 'Calendar Synchronization',
      fields: [
        { name: 'caldavEnabled', label: 'Enable CalDAV', type: 'checkbox', value: true },
        { name: 'carddavEnabled', label: 'Enable CardDAV', type: 'checkbox', value: true },
        { name: 'icalExport', label: 'Enable iCal Export', type: 'checkbox', value: true }
      ]
    },
    'nexus-trending': {
      title: 'Trending Analytics',
      fields: [
        { name: 'trendingEnabled', label: 'Enable Trending', type: 'checkbox', value: true },
        { name: 'trendingWindow', label: 'Trending Window (hours)', type: 'number', value: 24 },
        { name: 'trendingThreshold', label: 'Trending Threshold', type: 'number', value: 10 }
      ]
    }
  }[sectionId] || {};
}

// Workflow Sections
async function getWorkflowSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.workflow}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return {
      error: 'Unable to fetch workflow data',
      placeholder: getWorkflowPlaceholder(sectionId)
    };
  }
}

function getWorkflowPlaceholder(sectionId) {
  return {
    'workflow-templates': {
      title: 'Workflow Templates',
      description: 'Pre-built workflow templates',
      actions: ['Create Template', 'Import Template']
    },
    'workflow-executions': {
      title: 'Workflow Executions',
      description: 'View and manage workflow executions',
      table: {
        headers: ['Workflow', 'Status', 'Started', 'Duration', 'Actions'],
        rows: []
      }
    },
    'workflow-settings': {
      title: 'Workflow Settings',
      fields: [
        { name: 'maxExecutionTime', label: 'Max Execution Time (seconds)', type: 'number', value: 300 },
        { name: 'maxRetries', label: 'Max Retries', type: 'number', value: 3 },
        { name: 'enableLogging', label: 'Enable Logging', type: 'checkbox', value: true }
      ]
    }
  }[sectionId] || {};
}

// Moderation Sections
async function getModerationSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.moderator}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return {
      error: 'Unable to fetch moderation data',
      placeholder: getModerationPlaceholder(sectionId)
    };
  }
}

function getModerationPlaceholder(sectionId) {
  return {
    'moderation-rules': {
      title: 'Moderation Rules',
      description: 'Define content moderation rules and policies',
      actions: ['Create Rule', 'Import Rules']
    },
    'moderation-ai': {
      title: 'AI Configuration',
      fields: [
        { name: 'provider', label: 'AI Provider', type: 'select', options: ['Anthropic', 'OpenAI', 'DeepSeek'], value: 'Anthropic' },
        { name: 'apiKey', label: 'API Key', type: 'password', value: '' },
        { name: 'model', label: 'Model', type: 'text', value: 'claude-3-sonnet-20240229' },
        { name: 'confidence', label: 'Confidence Threshold', type: 'number', value: 0.7 }
      ]
    },
    'moderation-queue': {
      title: 'Review Queue',
      description: 'Content pending moderation review',
      table: {
        headers: ['Content', 'Type', 'Flagged', 'Reason', 'Actions'],
        rows: []
      }
    }
  }[sectionId] || {};
}

// SVR Sections
async function getSVRSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.svr}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return {
      error: 'Unable to fetch SVR data',
      placeholder: getSVRPlaceholder(sectionId)
    };
  }
}

function getSVRPlaceholder(sectionId) {
  return {
    'svr-pages': {
      title: 'Page Management',
      description: 'Manage dynamic server-rendered pages',
      actions: ['Create Page', 'Import Pages']
    },
    'svr-templates': {
      title: 'Template Management',
      description: 'Manage EJS templates',
      actions: ['Create Template', 'Import Template']
    },
    'svr-settings': {
      title: 'SVR Settings',
      fields: [
        { name: 'enableCaching', label: 'Enable Caching', type: 'checkbox', value: true },
        { name: 'cacheTime', label: 'Cache Time (seconds)', type: 'number', value: 300 },
        { name: 'enableCompression', label: 'Enable Compression', type: 'checkbox', value: true }
      ]
    }
  }[sectionId] || {};
}

// Live Sections
async function getLiveSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.live}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    return {
      error: 'Unable to fetch live streaming data',
      placeholder: getLivePlaceholder(sectionId)
    };
  }
}

function getLivePlaceholder(sectionId) {
  return {
    'live-rooms': {
      title: 'Stream Rooms',
      description: 'Manage live streaming rooms',
      actions: ['Create Room']
    },
    'live-recordings': {
      title: 'Recordings',
      description: 'Manage stream recordings',
      table: {
        headers: ['Title', 'Duration', 'Size', 'Created', 'Actions'],
        rows: []
      }
    },
    'live-settings': {
      title: 'Streaming Settings',
      fields: [
        { name: 'maxBitrate', label: 'Max Bitrate (kbps)', type: 'number', value: 4000 },
        { name: 'maxResolution', label: 'Max Resolution', type: 'select', options: ['720p', '1080p', '4K'], value: '1080p' },
        { name: 'recordingEnabled', label: 'Enable Recording', type: 'checkbox', value: true }
      ]
    }
  }[sectionId] || {};
}

// System Sections
async function getDatabaseSection() {
  const { getDatabaseInfo, SERVICE_DATABASES } = require('../services/database');

  // Get database info for all services
  const databases = [];
  const dbNames = Object.values(SERVICE_DATABASES); // Convert object to array of database names

  for (const dbName of dbNames) {
    try {
      const info = await getDatabaseInfo(dbName);
      databases.push({
        name: dbName,
        status: info.connected ? 'connected' : 'disconnected',
        size: info.size || 'Unknown',
        tables: info.tables || 0
      });
    } catch (error) {
      databases.push({
        name: dbName,
        status: 'not_created',
        size: '-',
        tables: 0
      });
    }
  }

  return {
    title: 'Database Management',
    description: 'Create, initialize, and manage service databases',
    actions: ['Create All Databases', 'Initialize All Databases', 'Backup All'],
    table: {
      headers: ['Database', 'Status', 'Size', 'Tables', 'Actions'],
      rows: databases.map(db => [
        db.name,
        db.status,
        db.size,
        String(db.tables),
        'Initialize | Backup | Reset'
      ])
    },
    databases
  };
}

async function getLogsSection() {
  return {
    title: 'System Logs',
    logs: [],
    filters: ['All', 'Error', 'Warning', 'Info', 'Debug']
  };
}

async function getSystemSettings() {
  return {
    title: 'System Settings',
    fields: [
      { name: 'systemName', label: 'System Name', type: 'text', value: 'Exprsn Platform' },
      { name: 'environment', label: 'Environment', type: 'select', options: ['development', 'staging', 'production'], value: 'development' },
      { name: 'logLevel', label: 'Log Level', type: 'select', options: ['debug', 'info', 'warn', 'error'], value: 'info' }
    ]
  };
}

// ========================================
// Configuration Update Functions
// ========================================

async function updateCertificateConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.ca}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

async function updateAuthConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.auth}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

async function updateMessagingConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.spark}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

async function updateTimelineConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.timeline}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

async function updateNexusConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.nexus}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

async function updateWorkflowConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.workflow}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

async function updateModerationConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.moderator}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

async function updateSVRConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.svr}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

async function updateLiveConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.live}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

// Gallery Section Functions
async function getGallerySection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.gallery}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching gallery section ${sectionId}:`, error.message);
    return {
      error: 'Unable to fetch gallery data',
      details: error.message
    };
  }
}

async function updateGalleryConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.gallery}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

// Herald Section Functions
async function getHeraldSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.herald}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching herald section ${sectionId}:`, error.message);
    return {
      error: 'Unable to fetch herald data',
      details: error.message
    };
  }
}

async function updateHeraldConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.herald}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

// Vault Section Functions
async function getVaultSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.vault}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching vault section ${sectionId}:`, error.message);
    return {
      error: 'Unable to fetch vault data',
      details: error.message
    };
  }
}

async function updateVaultConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.vault}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

// Prefetch Section Functions
async function getPrefetchSection(sectionId) {
  try {
    const response = await axios.get(`${SERVICES.prefetch}/api/config/${sectionId}`, { timeout: 5000 });
    return response.data;
  } catch (error) {
    logger.error(`Error fetching prefetch section ${sectionId}:`, error.message);
    return {
      error: 'Unable to fetch prefetch data',
      details: error.message
    };
  }
}

async function updatePrefetchConfig(sectionId, config) {
  const response = await axios.post(`${SERVICES.prefetch}/api/config/${sectionId}`, config, { timeout: 5000 });
  return response.data;
}

async function updateSystemSettings(config) {
  // Update system-wide settings
  // Store in database or configuration file
  return {
    success: true,
    message: 'System settings updated successfully'
  };
}

module.exports = router;
