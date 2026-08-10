/**
 * Low-Code Platform Configuration
 *
 * Central configuration for the low-code application development platform.
 * This includes settings for forms, applications, workflows, BPM, and automation.
 */

module.exports = {
  // Platform Settings
  platform: {
    name: 'Exprsn Low-Code Platform',
    version: '1.0.0',
    enabled: process.env.LOWCODE_ENABLED !== 'false', // Enabled by default
    basePath: '/lowcode', // Base URL path for low-code routes
  },

  // Form Designer Settings
  forms: {
    maxFormSize: 10 * 1024 * 1024, // 10MB max form definition size
    maxFields: 500, // Maximum fields per form
    maxFormSubmissionSize: 50 * 1024 * 1024, // 50MB max submission size
    autoSaveInterval: 30000, // 30 seconds auto-save
    validationDebounce: 500, // 500ms debounce for validation
    enableRealTimeCollaboration: true,
    maxConcurrentUsers: 10, // Max concurrent users on same form
  },

  // Formula Engine Settings
  formula: {
    maxExecutionTime: 5000, // 5 seconds max formula execution
    maxRecursionDepth: 100,
    enableCaching: true,
    cacheTTL: 3600, // 1 hour cache TTL
    sandboxTimeout: 3000, // 3 seconds for sandboxed code
  },

  // Data Source Settings
  dataSources: {
    maxConnections: 100,
    connectionTimeout: 30000, // 30 seconds
    queryTimeout: 60000, // 60 seconds
    maxResultSize: 100 * 1024 * 1024, // 100MB max result set
    enableQueryCaching: true,
    queryCacheTTL: 300, // 5 minutes

    // Supported connection types
    supportedTypes: [
      'postgresql',
      'forge', // Exprsn Forge integration
      'rest',
      'soap',
      'webhook',
      'json',
      'xml',
      'csv',
      'tsv'
    ],
  },

  // Application Settings
  applications: {
    maxAppsPerUser: 1000,
    maxEntitiesPerApp: 200,
    maxFormsPerApp: 500,
    maxCardsPerApp: 1000,
    enableVersionControl: true,
    enableGitIntegration: process.env.GIT_INTEGRATION_ENABLED === 'true',
    gitProvider: process.env.GIT_PROVIDER || 'github', // github, gitlab, bitbucket
  },

  // Cards (Reusable Components) Settings
  cards: {
    maxCardSize: 5 * 1024 * 1024, // 5MB max card size
    enableMarketplace: false, // Marketplace feature (future)
    allowPrivateCards: true,
    allowPublicCards: true,
    maxVersionsPerCard: 100,
  },

  // BPM & Automation Settings
  bpm: {
    maxProcessesPerApp: 100,
    maxStepsPerProcess: 500,
    maxRunningInstances: 10000,
    processTimeout: 7 * 24 * 60 * 60 * 1000, // 7 days default
    enableBPMNExport: true,
    enableBPMNImport: true,

    // Queue settings for background processing
    queue: {
      redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD || undefined,
        db: process.env.LOWCODE_REDIS_DB || 5,
      },
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false,
      },
    },
  },

  // Automation Settings
  automation: {
    maxAutomationsPerApp: 200,
    maxTriggersPerAutomation: 10,
    maxActionsPerAutomation: 50,
    enableScheduledAutomation: true,
    enableEventDrivenAutomation: true,
    enableWebhooks: true,

    // Cron job settings
    cron: {
      timezone: process.env.TZ || 'UTC',
      maxConcurrentJobs: 100,
    },

    // Webhook settings
    webhooks: {
      maxWebhooksPerApp: 50,
      timeout: 30000, // 30 seconds
      maxRetries: 3,
      enableSignatureVerification: true,
    },
  },

  // Variables & Parameters
  variables: {
    maxGlobalVariables: 500,
    maxProcessVariables: 200,
    maxEnvironmentVariables: 100,
    maxVariableSize: 1 * 1024 * 1024, // 1MB max variable size
    enableEncryption: true, // Encrypt sensitive variables
  },

  // Decision Tables & Business Rules
  rules: {
    maxRulesPerTable: 1000,
    maxConditionsPerRule: 50,
    maxDecisionTablesPerApp: 100,
    enableRuleVersioning: true,
  },

  // Polls Settings
  polls: {
    maxPollsPerApp: 500,
    maxOptionsPerPoll: 50,
    maxResponsesPerPoll: 1000000, // 1 million responses
    allowAnonymousVoting: true,
    allowMultipleResponses: false, // Default: one response per user
  },

  // Grid (Subgrid) Settings
  grids: {
    maxGridsPerForm: 20,
    maxRowsPerGrid: 10000,
    maxColumnsPerGrid: 100,
    enableInlineEditing: true,
    enableBulkOperations: true,
    defaultPageSize: 25,
    maxPageSize: 500,
  },

  // Security Settings
  security: {
    enableCSRFProtection: true,
    enableXSSProtection: true,
    enableSQLInjectionProtection: true,
    enableRateLimiting: true,
    rateLimitWindowMs: 15 * 60 * 1000, // 15 minutes
    rateLimitMaxRequests: 1000,

    // Code execution settings (for formula engine and custom code)
    sandbox: {
      memoryLimit: 256, // 256MB
      timeout: 5000, // 5 seconds
      enableNodeModules: false, // Don't allow require() in sandboxed code
      allowedGlobals: ['Date', 'Math', 'JSON', 'Array', 'Object', 'String', 'Number'],
    },
  },

  // Performance Settings
  performance: {
    enableCaching: true,
    cacheTTL: 3600, // 1 hour
    enableCompression: true,
    enableLazyLoading: true,
    maxConcurrentRequests: 100,
  },

  // Collaboration Settings
  collaboration: {
    enableRealTime: true,
    maxCollaborators: 10,
    presenceTimeout: 60000, // 1 minute
    enableComments: true,
    enableVersionHistory: true,
    maxVersionsPerResource: 100,
  },

  // Export/Import Settings
  export: {
    enableApplicationExport: true,
    enableFormExport: true,
    enableCardExport: true,
    enableProcessExport: true,
    exportFormat: ['json', 'zip', 'xml'],
    maxExportSize: 100 * 1024 * 1024, // 100MB
  },

  // Forge Integration Settings
  forge: {
    enabled: process.env.FORGE_INTEGRATION_ENABLED !== 'false',
    serviceUrl: process.env.FORGE_SERVICE_URL || 'http://localhost:3016',
    timeout: 30000, // 30 seconds
    enableSchemaImport: true,
    enableAutoSync: false, // Sync Forge changes automatically
    syncInterval: 3600000, // 1 hour

    // CRM/ERP modules to integrate
    modules: {
      crm: true,
      erp: true,
      groupware: true,
    },
  },

  // Workflow Integration Settings (exprsn-workflow)
  workflow: {
    enabled: process.env.WORKFLOW_INTEGRATION_ENABLED !== 'false',
    serviceUrl: process.env.WORKFLOW_SERVICE_URL || 'http://localhost:3017',
    timeout: 30000,
    enableAutoTrigger: true, // Auto-trigger workflows from form events
  },

  // UI Settings
  ui: {
    theme: 'bootstrap5',
    enableDarkMode: true,
    enableAccessibility: true,
    wcagLevel: 'AA', // WCAG 2.1 Level AA compliance

    // Editor settings
    editor: {
      fontSize: 14,
      tabSize: 2,
      enableMinimap: true,
      enableAutocomplete: true,
      enableSyntaxHighlighting: true,
      theme: 'vs-dark',
    },

    // Designer settings
    designer: {
      gridSize: 8, // 8px grid
      snapToGrid: true,
      showGrid: true,
      enableDragDrop: true,
      enableUndo: true,
      maxUndoSteps: 50,
    },
  },

  // Logging Settings
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableAuditLog: true,
    enablePerformanceLog: true,
    enableErrorTracking: true,
    logRetentionDays: 90,
  },

  // Database Settings
  database: {
    dialect: 'postgres',
    pool: {
      max: 20,
      min: 5,
      acquire: 30000,
      idle: 10000,
    },
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
  },
};
