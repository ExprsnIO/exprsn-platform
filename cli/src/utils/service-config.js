/**
 * Service Configuration
 * Defines all Exprsn services and their metadata
 */

const SERVICES = [
  {
    id: 'ca',
    name: 'exprsn-ca',
    description: 'Certificate Authority - Core authentication service',
    path: 'src/exprsn-ca',
    port: 3000,
    status: 'production',
    critical: true,
    healthEndpoint: '/health',
    dependencies: []
  },
  {
    id: 'setup',
    name: 'exprsn-setup',
    description: 'Setup & Management - Service discovery and configuration',
    path: 'src/exprsn-setup',
    port: 3015,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca']
  },
  {
    id: 'auth',
    name: 'exprsn-auth',
    description: 'Authentication & SSO - OAuth2, SAML, MFA',
    path: 'src/exprsn-auth',
    port: 3001,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca']
  },
  {
    id: 'spark',
    name: 'exprsn-spark',
    description: 'Real-time Messaging - WebSocket-based instant messaging',
    path: 'src/exprsn-spark',
    port: 3002,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca', 'auth']
  },
  {
    id: 'timeline',
    name: 'exprsn-timeline',
    description: 'Social Feed - Timeline and social interactions',
    path: 'src/exprsn-timeline',
    port: 3004,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca', 'auth']
  },
  {
    id: 'prefetch',
    name: 'exprsn-prefetch',
    description: 'Timeline Prefetching - Optimized feed caching',
    path: 'src/exprsn-prefetch',
    port: 3005,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca', 'timeline']
  },
  {
    id: 'moderator',
    name: 'exprsn-moderator',
    description: 'Content Moderation - AI-powered content filtering',
    path: 'src/exprsn-moderator',
    port: 3006,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca']
  },
  {
    id: 'filevault',
    name: 'exprsn-filevault',
    description: 'File Storage - S3-compatible file management',
    path: 'src/exprsn-filevault',
    port: 3007,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca', 'auth']
  },
  {
    id: 'gallery',
    name: 'exprsn-gallery',
    description: 'Media Galleries - Photo and video management',
    path: 'src/exprsn-gallery',
    port: 3008,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca', 'filevault']
  },
  {
    id: 'live',
    name: 'exprsn-live',
    description: 'Live Streaming - WebRTC video streaming',
    path: 'src/exprsn-live',
    port: 3009,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca', 'auth']
  },
  {
    id: 'bridge',
    name: 'exprsn-bridge',
    description: 'API Gateway - Unified API gateway and routing',
    path: 'src/exprsn-bridge',
    port: 3010,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca']
  },
  {
    id: 'nexus',
    name: 'exprsn-nexus',
    description: 'Groups & Events - Social groups and event management',
    path: 'src/exprsn-nexus',
    port: 3011,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca', 'auth']
  },
  {
    id: 'pulse',
    name: 'exprsn-pulse',
    description: 'Analytics & Metrics - Real-time analytics and monitoring',
    path: 'src/exprsn-pulse',
    port: 3012,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca']
  },
  {
    id: 'vault',
    name: 'exprsn-vault',
    description: 'Secrets Management - Centralized secrets storage',
    path: 'src/exprsn-vault',
    port: 3013,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca']
  },
  {
    id: 'herald',
    name: 'exprsn-herald',
    description: 'Notifications & Alerts - Multi-channel notification delivery',
    path: 'src/exprsn-herald',
    port: 3014,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca']
  },
  {
    id: 'workflow',
    name: 'exprsn-workflow',
    description: 'Workflow Automation - Visual workflow builder',
    path: 'src/exprsn-workflow',
    port: 3017,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca']
  },
  {
    id: 'svr',
    name: 'exprsn-svr',
    description: 'Business Hub - Low-Code Platform and Forge CRM/ERP',
    path: 'src/exprsn-svr',
    port: 5001,
    status: 'production',
    healthEndpoint: '/health',
    dependencies: ['ca', 'auth']
  },
  {
    id: 'payments',
    name: 'exprsn-payments',
    description: 'Payment Processing - Multi-gateway payment handling',
    path: 'src/exprsn-payments',
    port: 3018,
    status: 'development',
    healthEndpoint: '/health',
    dependencies: ['ca', 'auth']
  },
  {
    id: 'atlas',
    name: 'exprsn-atlas',
    description: 'Geospatial Services - Location and mapping services',
    path: 'src/exprsn-atlas',
    port: 3019,
    status: 'development',
    healthEndpoint: '/health',
    dependencies: ['ca']
  },
  {
    id: 'dbadmin',
    name: 'exprsn-dbadmin',
    description: 'Database Administration - Web-based DB management',
    path: 'src/exprsn-dbadmin',
    port: 3020,
    status: 'development',
    healthEndpoint: '/health',
    dependencies: ['ca', 'auth']
  },
  {
    id: 'bluesky',
    name: 'exprsn-bluesky',
    description: 'Bluesky Integration - AT Protocol client',
    path: 'src/exprsn-bluesky',
    port: 3021,
    status: 'development',
    healthEndpoint: '/health',
    dependencies: ['ca', 'auth']
  }
];

/**
 * Get service configuration by ID or name
 */
function getServiceConfig(idOrName) {
  return SERVICES.find(s => s.id === idOrName || s.name === idOrName);
}

/**
 * Get production services
 */
function getProductionServices() {
  return SERVICES.filter(s => s.status === 'production');
}

/**
 * Get development services
 */
function getDevelopmentServices() {
  return SERVICES.filter(s => s.status === 'development');
}

/**
 * Get service dependencies
 */
function getServiceDependencies(serviceId) {
  const service = getServiceConfig(serviceId);
  if (!service) return [];

  return service.dependencies.map(dep =>
    typeof dep === 'string' ? getServiceConfig(dep) : dep
  ).filter(Boolean);
}

module.exports = {
  SERVICES,
  getServiceConfig,
  getProductionServices,
  getDevelopmentServices,
  getServiceDependencies
};
