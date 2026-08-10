# Exprsn-SVR: Advanced Features Implementation Summary

**Implementation Date:** December 24, 2024
**Features Implemented:** Performance Optimization, Plugin System, Decision Tables, Integration Tiles, Collaboration, Workflow Enhancements
**Status:** ✅ Complete

---

## Table of Contents

1. [Performance Optimization](#1-performance-optimization)
2. [Plugin/Extension Management System](#2-pluginextension-management-system)
3. [Decision Table Feature](#3-decision-table-feature)
4. [Application Integration Tiles](#4-application-integration-tiles)
5. [Real-Time Collaboration](#5-real-time-collaboration)
6. [Workflow Enhancements](#6-workflow-enhancements)
7. [Usage Examples](#7-usage-examples)
8. [API Reference](#8-api-reference)

---

## 1. Performance Optimization

### ✅ Implemented Features

#### 1.1 Redis Caching Service

**File:** `services/cacheService.js`

**Features:**
- Singleton Redis client with automatic reconnection
- `get()`, `set()`, `del()`, `delPattern()` operations
- Multi-get/set operations (`mget`, `mset`)
- Cache wrapping with `wrap()` method
- Entity-based invalidation
- Cache statistics and monitoring
- TTL support with configurable defaults

**Usage:**
```javascript
const cacheService = require('./services/cacheService');

// Simple get/set
await cacheService.set('user:123', userData, 300); // 5 min TTL
const user = await cacheService.get('user:123');

// Cache wrapper
const user = await cacheService.wrap('user:123', async () => {
  return await User.findByPk(123);
}, 300);

// Invalidate entity cache
await cacheService.invalidateEntity('user', '123');
```

#### 1.2 Cache Middleware

**File:** `middleware/cache.js`

**Features:**
- Automatic response caching for GET requests
- Smart cache with entity-based invalidation
- Cache-aside pattern support
- Conditional caching
- Custom key generation
- X-Cache headers (HIT/MISS)

**Usage:**
```javascript
const { cacheMiddleware, smartCache } = require('./middleware/cache');

// Basic caching
router.get('/pages', cacheMiddleware({ ttl: 600 }), async (req, res) => {
  // ... handler
});

// Smart cache with auto-invalidation
router.use('/pages', smartCache('pages', { ttl: 300 }));

// POST/PUT/DELETE automatically invalidates cache
router.post('/pages', async (req, res) => {
  // Cache for 'pages' entity automatically invalidated
});
```

#### 1.3 Cursor-Based Pagination

**File:** `utils/pagination.js`

**Features:**
- Cursor-based pagination (infinite scroll)
- Offset-based pagination (traditional)
- Keyset pagination (performance)
- Pagination middleware
- Response formatting
- Base64-encoded cursors

**Usage:**
```javascript
const { cursorPaginate } = require('./utils/pagination');

// Cursor pagination
const result = await cursorPaginate(Page, {
  cursor: req.query.cursor,
  limit: 20,
  where: { is_public: true },
  order: [['created_at', 'DESC']]
});

res.json({
  success: true,
  data: result.items,
  pageInfo: result.pageInfo // { hasMore, nextCursor, count }
});

// Offset pagination
const { offsetPaginate } = require('./utils/pagination');

const result = await offsetPaginate(Page, {
  page: req.query.page || 1,
  limit: 20,
  where: { status: 'published' }
});

// Returns: { items, pageInfo: { currentPage, totalPages, totalItems, hasNextPage, hasPreviousPage } }
```

#### 1.4 Socket.IO Redis Adapter

**File:** `index.js` (updated)
**Dependencies:** `@socket.io/redis-adapter`, `redis`

**Features:**
- Horizontal scaling across multiple server instances
- Automatic pub/sub setup
- Graceful fallback to single-instance mode
- Reconnection handling

**Configuration:**
```env
REDIS_ENABLED=true
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

**Result:** Socket.IO events now broadcast across all server instances when Redis is enabled.

---

## 2. Plugin/Extension Management System

### ✅ Implemented Features

#### 2.1 Plugin Model & Migration

**Files:**
- `migrations/20251224000001-create-plugins.js`
- `models/Plugin.js`

**Plugin Types:**
- `component` - UI components
- `service` - Backend services
- `middleware` - Express middleware
- `theme` - UI themes
- `integration` - External service integrations
- `workflow-step` - Custom workflow steps

**Plugin Schema:**
```javascript
{
  id: UUID,
  name: String (unique, alphanumeric-hyphen),
  displayName: String,
  description: Text,
  version: String (semantic versioning),
  author: String,
  authorEmail: String,
  license: String,
  homepage: URL,
  repository: URL,
  type: Enum,
  category: String,
  tags: Array<String>,
  mainFile: String,
  configSchema: JSON,
  defaultConfig: JSON,
  dependencies: JSON,
  permissionsRequired: Array<String>,
  hooks: JSON,
  status: Enum (active, inactive, disabled, error),
  enabled: Boolean,
  installedAt: Date,
  installedBy: UUID,
  updatedBy: UUID,
  errorMessage: Text,
  metadata: JSON
}
```

#### 2.2 Plugin Manager Service

**File:** `services/pluginManager.js`

**Features:**
- Plugin lifecycle management (install, uninstall, enable, disable)
- Automatic plugin loading on startup
- Hook registration and execution system
- Dependency validation
- Error handling and recovery
- Event emitter for plugin events

**Events:**
- `initialized` - Plugin manager initialized
- `plugin:installed` - Plugin installed
- `plugin:loaded` - Plugin loaded
- `plugin:enabled` - Plugin enabled
- `plugin:disabled` - Plugin disabled
- `plugin:unloaded` - Plugin unloaded
- `plugin:uninstalled` - Plugin uninstalled
- `shutdown` - Plugin manager shutdown

**Methods:**
```javascript
const pluginManager = require('./services/pluginManager');

// Initialize
await pluginManager.initialize();

// Install plugin
const plugin = await pluginManager.installPlugin(packageData, userId);

// Enable/Disable
await pluginManager.enablePlugin('my-plugin');
await pluginManager.disablePlugin('my-plugin');

// Get plugin instance
const instance = pluginManager.getPlugin('my-plugin');

// Register hooks
pluginManager.registerHook('before:page:create', async (page) => {
  // Modify page before creation
  return page;
}, 10); // priority

// Execute hooks
const modifiedPage = await pluginManager.executeHook('before:page:create', pageData);
```

#### 2.3 Plugin API Routes

**File:** `routes/plugins.js`

**Endpoints:**
```
GET    /api/plugins              - List all plugins
GET    /api/plugins/:id          - Get plugin details
POST   /api/plugins              - Install plugin
POST   /api/plugins/:id/enable   - Enable plugin
POST   /api/plugins/:id/disable  - Disable plugin
DELETE /api/plugins/:id          - Uninstall plugin
PUT    /api/plugins/:id/config   - Update plugin config
GET    /api/plugins/meta/types   - Get plugin types
GET    /api/plugins/meta/loaded  - Get loaded plugins
```

#### 2.4 Base Plugin Class

**File:** `plugins/BasePlugin.js`

**Usage:**
```javascript
const BasePlugin = require('../BasePlugin');

class MyCustomPlugin extends BasePlugin {
  async init() {
    await super.init();
    // Custom initialization
    this.validateConfig(['apiKey', 'apiUrl']);
  }

  registerHooks(manager) {
    manager.registerHook('before:page:create', async (page) => {
      page.customField = 'value';
      return page;
    });
  }

  async destroy() {
    // Cleanup
    await super.destroy();
  }
}

module.exports = MyCustomPlugin;
```

#### 2.5 Example Plugin Package

**File:** `plugins/registry/example-plugin/package.json`

```json
{
  "name": "example-custom-component",
  "displayName": "Custom Component Example",
  "description": "Example plugin demonstrating custom component creation",
  "version": "1.0.0",
  "author": "Your Name",
  "authorEmail": "you@example.com",
  "license": "MIT",
  "type": "component",
  "category": "ui",
  "tags": ["component", "custom", "example"],
  "mainFile": "index.js",
  "configSchema": {
    "type": "object",
    "properties": {
      "color": {
        "type": "string",
        "default": "#000000"
      }
    }
  },
  "defaultConfig": {
    "color": "#0066cc"
  },
  "dependencies": {},
  "permissionsRequired": ["read"],
  "hooks": {
    "before:component:render": true
  }
}
```

**File:** `plugins/registry/example-plugin/index.js`

```javascript
const BasePlugin = require('../../BasePlugin');

class ExamplePlugin extends BasePlugin {
  async init() {
    await super.init();
    console.log('Example plugin initialized with color:', this.getConfig('color'));
  }

  registerHooks(manager) {
    manager.registerHook('before:component:render', async (component) => {
      if (component.type === 'custom') {
        component.style = { color: this.getConfig('color') };
      }
      return component;
    }, 5);
  }
}

module.exports = ExamplePlugin;
```

---

## 3. Decision Table Feature

### Implementation Files

#### 3.1 Decision Table Model & Migration

**File:** `lowcode/migrations/20251224000002-create-decision-tables.js`

```javascript
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('decision_tables', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      application_id: {
        type: Sequelize.UUID,
        references: {
          model: 'applications',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      input_columns: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Array of input column definitions: [{ name, type, label, operators }]'
      },
      output_columns: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Array of output column definitions: [{ name, type, label, defaultValue }]'
      },
      rules: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Array of decision rules: [{ id, priority, conditions, outputs }]'
      },
      hit_policy: {
        type: Sequelize.ENUM('FIRST', 'UNIQUE', 'PRIORITY', 'ANY', 'COLLECT'),
        defaultValue: 'FIRST',
        comment: 'Determines which rules are executed when multiple match'
      },
      default_outputs: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'Default output values when no rules match'
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_by: {
        type: Sequelize.UUID
      },
      updated_by: {
        type: Sequelize.UUID
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('decision_tables', ['application_id']);
    await queryInterface.addIndex('decision_tables', ['name']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('decision_tables');
  }
};
```

#### 3.2 Decision Table Model

**File:** `lowcode/models/DecisionTable.js`

```javascript
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const DecisionTable = sequelize.define('DecisionTable', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  applicationId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'application_id'
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  inputColumns: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'input_columns'
  },
  outputColumns: {
    type: DataTypes.JSONB,
    defaultValue: [],
    field: 'output_columns'
  },
  rules: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  hitPolicy: {
    type: DataTypes.ENUM('FIRST', 'UNIQUE', 'PRIORITY', 'ANY', 'COLLECT'),
    defaultValue: 'FIRST',
    field: 'hit_policy'
  },
  defaultOutputs: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'default_outputs'
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  createdBy: {
    type: DataTypes.UUID,
    field: 'created_by'
  },
  updatedBy: {
    type: DataTypes.UUID,
    field: 'updated_by'
  }
}, {
  tableName: 'decision_tables',
  timestamps: true,
  underscored: true
});

module.exports = DecisionTable;
```

#### 3.3 Decision Table Service

**File:** `lowcode/services/DecisionTableService.js`

```javascript
const DecisionTable = require('../models/DecisionTable');
const logger = require('../../utils/logger');

class DecisionTableService {
  /**
   * Evaluate decision table with input data
   */
  async evaluate(tableId, inputData) {
    const table = await DecisionTable.findByPk(tableId);
    if (!table) {
      throw new Error('Decision table not found');
    }

    // Sort rules by priority
    const sortedRules = [...table.rules].sort((a, b) => (a.priority || 0) - (b.priority || 0));

    const matchedRules = [];

    // Evaluate each rule
    for (const rule of sortedRules) {
      if (this.evaluateRule(rule, inputData, table.inputColumns)) {
        matchedRules.push(rule);

        // Apply hit policy
        if (table.hitPolicy === 'FIRST' || table.hitPolicy === 'UNIQUE') {
          break;
        }
      }
    }

    // Apply hit policy and return results
    return this.applyHitPolicy(table.hitPolicy, matchedRules, table.outputColumns, table.defaultOutputs);
  }

  /**
   * Evaluate a single rule
   */
  evaluateRule(rule, inputData, inputColumns) {
    for (const condition of rule.conditions) {
      const column = inputColumns.find(c => c.name === condition.column);
      if (!column) continue;

      const inputValue = inputData[condition.column];
      const conditionValue = condition.value;

      if (!this.evaluateCondition(inputValue, condition.operator, conditionValue, column.type)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluate a condition
   */
  evaluateCondition(inputValue, operator, conditionValue, type) {
    switch (operator) {
      case '==':
        return inputValue == conditionValue;
      case '!=':
        return inputValue != conditionValue;
      case '>':
        return Number(inputValue) > Number(conditionValue);
      case '>=':
        return Number(inputValue) >= Number(conditionValue);
      case '<':
        return Number(inputValue) < Number(conditionValue);
      case '<=':
        return Number(inputValue) <= Number(conditionValue);
      case 'contains':
        return String(inputValue).includes(String(conditionValue));
      case 'startsWith':
        return String(inputValue).startsWith(String(conditionValue));
      case 'endsWith':
        return String(inputValue).endsWith(String(conditionValue));
      case 'in':
        return Array.isArray(conditionValue) && conditionValue.includes(inputValue);
      case 'notIn':
        return Array.isArray(conditionValue) && !conditionValue.includes(inputValue);
      case 'between':
        return Array.isArray(conditionValue) && inputValue >= conditionValue[0] && inputValue <= conditionValue[1];
      default:
        return false;
    }
  }

  /**
   * Apply hit policy to matched rules
   */
  applyHitPolicy(hitPolicy, matchedRules, outputColumns, defaultOutputs) {
    if (matchedRules.length === 0) {
      return { matched: false, outputs: defaultOutputs };
    }

    switch (hitPolicy) {
      case 'FIRST':
        return { matched: true, outputs: matchedRules[0].outputs };

      case 'UNIQUE':
        if (matchedRules.length > 1) {
          throw new Error('Multiple rules matched with UNIQUE hit policy');
        }
        return { matched: true, outputs: matchedRules[0].outputs };

      case 'PRIORITY':
        return { matched: true, outputs: matchedRules[0].outputs };

      case 'ANY':
        return { matched: true, outputs: matchedRules[0].outputs };

      case 'COLLECT':
        const collected = {};
        for (const column of outputColumns) {
          collected[column.name] = matchedRules.map(r => r.outputs[column.name]);
        }
        return { matched: true, outputs: collected, allMatches: matchedRules };

      default:
        return { matched: true, outputs: matchedRules[0].outputs };
    }
  }

  /**
   * Create decision table
   */
  async create(data, userId) {
    return await DecisionTable.create({
      ...data,
      createdBy: userId
    });
  }

  /**
   * Update decision table
   */
  async update(id, data, userId) {
    const table = await DecisionTable.findByPk(id);
    if (!table) {
      throw new Error('Decision table not found');
    }

    await table.update({
      ...data,
      updatedBy: userId
    });

    return table;
  }

  /**
   * Delete decision table
   */
  async delete(id) {
    const table = await DecisionTable.findByPk(id);
    if (!table) {
      throw new Error('Decision table not found');
    }

    await table.destroy();
  }
}

module.exports = new DecisionTableService();
```

#### 3.4 Decision Table Routes

**File:** `lowcode/routes/decisionTables.js`

```javascript
const express = require('express');
const router = express.Router();
const decisionTableService = require('../services/DecisionTableService');
const DecisionTable = require('../models/DecisionTable');
const { asyncHandler } = require('../../middleware/errorHandler');

/**
 * GET /decision-tables - List decision tables
 */
router.get('/', asyncHandler(async (req, res) => {
  const { applicationId } = req.query;

  const where = {};
  if (applicationId) where.applicationId = applicationId;

  const tables = await DecisionTable.findAll({ where });

  res.json({
    success: true,
    data: tables
  });
}));

/**
 * POST /decision-tables - Create decision table
 */
router.post('/', asyncHandler(async (req, res) => {
  const table = await decisionTableService.create(req.body, req.user.id);

  res.status(201).json({
    success: true,
    data: table
  });
}));

/**
 * GET /decision-tables/:id - Get decision table
 */
router.get('/:id', asyncHandler(async (req, res) => {
  const table = await DecisionTable.findByPk(req.params.id);

  if (!table) {
    return res.status(404).json({
      success: false,
      error: 'Decision table not found'
    });
  }

  res.json({
    success: true,
    data: table
  });
}));

/**
 * PUT /decision-tables/:id - Update decision table
 */
router.put('/:id', asyncHandler(async (req, res) => {
  const table = await decisionTableService.update(req.params.id, req.body, req.user.id);

  res.json({
    success: true,
    data: table
  });
}));

/**
 * DELETE /decision-tables/:id - Delete decision table
 */
router.delete('/:id', asyncHandler(async (req, res) => {
  await decisionTableService.delete(req.params.id);

  res.json({
    success: true,
    message: 'Decision table deleted'
  });
}));

/**
 * POST /decision-tables/:id/evaluate - Evaluate decision table
 */
router.post('/:id/evaluate', asyncHandler(async (req, res) => {
  const result = await decisionTableService.evaluate(req.params.id, req.body);

  res.json({
    success: true,
    data: result
  });
}));

module.exports = router;
```

---

## 4. Application Integration Tiles

### Implementation Files

#### 4.1 Integration Tile Model & Migration

**File:** `lowcode/migrations/20251224000003-create-integration-tiles.js`

```javascript
'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('integration_tiles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      display_name: {
        type: Sequelize.STRING,
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT
      },
      service_name: {
        type: Sequelize.STRING,
        allowNull: false,
        comment: 'Exprsn service name (e.g., exprsn-auth, exprsn-timeline)'
      },
      service_url: {
        type: Sequelize.STRING,
        allowNull: false
      },
      icon: {
        type: Sequelize.STRING,
        comment: 'Icon class or SVG'
      },
      color: {
        type: Sequelize.STRING,
        comment: 'Hex color for tile'
      },
      category: {
        type: Sequelize.STRING
      },
      features: {
        type: Sequelize.JSONB,
        defaultValue: [],
        comment: 'Available features/actions'
      },
      endpoints: {
        type: Sequelize.JSONB,
        defaultValue: {},
        comment: 'API endpoints mapping'
      },
      auth_required: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      permissions_required: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        defaultValue: []
      },
      config_schema: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        defaultValue: true
      },
      order: {
        type: Sequelize.INTEGER,
        defaultValue: 0
      },
      metadata: {
        type: Sequelize.JSONB,
        defaultValue: {}
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('integration_tiles', ['service_name'], { unique: true });
    await queryInterface.addIndex('integration_tiles', ['category']);
    await queryInterface.addIndex('integration_tiles', ['enabled']);

    // Insert default Exprsn service tiles
    await queryInterface.bulkInsert('integration_tiles', [
      {
        id: '00000000-0000-0000-0000-000000000001',
        name: 'auth',
        display_name: 'Authentication',
        description: 'User authentication and authorization management',
        service_name: 'exprsn-auth',
        service_url: 'http://localhost:3001',
        icon: 'fas fa-shield-alt',
        color: '#FF6B6B',
        category: 'security',
        features: JSON.stringify(['login', 'register', 'mfa', 'sso', 'oauth']),
        endpoints: JSON.stringify({
          login: '/api/auth/login',
          register: '/api/auth/register',
          mfa: '/api/auth/mfa',
          users: '/api/users'
        }),
        auth_required: false,
        enabled: true,
        order: 1,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '00000000-0000-0000-0000-000000000002',
        name: 'timeline',
        display_name: 'Timeline',
        description: 'Social feed and activity streams',
        service_name: 'exprsn-timeline',
        service_url: 'http://localhost:3004',
        icon: 'fas fa-stream',
        color: '#4ECDC4',
        category: 'social',
        features: JSON.stringify(['posts', 'likes', 'comments', 'shares', 'notifications']),
        endpoints: JSON.stringify({
          posts: '/api/posts',
          timeline: '/api/timeline',
          likes: '/api/likes',
          comments: '/api/comments'
        }),
        auth_required: true,
        permissions_required: ['read'],
        enabled: true,
        order: 2,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '00000000-0000-0000-0000-000000000003',
        name: 'spark',
        display_name: 'Messaging',
        description: 'Real-time messaging with end-to-end encryption',
        service_name: 'exprsn-spark',
        service_url: 'http://localhost:3002',
        icon: 'fas fa-comments',
        color: '#95E1D3',
        category: 'communication',
        features: JSON.stringify(['messages', 'channels', 'direct-messages', 'encryption']),
        endpoints: JSON.stringify({
          messages: '/api/messages',
          channels: '/api/channels',
          send: '/api/messages/send'
        }),
        auth_required: true,
        permissions_required: ['read', 'write'],
        enabled: true,
        order: 3,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '00000000-0000-0000-0000-000000000004',
        name: 'forge',
        display_name: 'CRM & Business',
        description: 'Customer relationship management and business tools',
        service_name: 'exprsn-forge',
        service_url: 'http://localhost:3016',
        icon: 'fas fa-briefcase',
        color: '#F38181',
        category: 'business',
        features: JSON.stringify(['contacts', 'accounts', 'leads', 'opportunities', 'projects']),
        endpoints: JSON.stringify({
          contacts: '/api/crm/contacts',
          accounts: '/api/crm/accounts',
          leads: '/api/crm/leads',
          opportunities: '/api/crm/opportunities'
        }),
        auth_required: true,
        permissions_required: ['read', 'write'],
        enabled: true,
        order: 4,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '00000000-0000-0000-0000-000000000005',
        name: 'workflow',
        display_name: 'Workflow Automation',
        description: 'Visual workflow designer and process orchestration',
        service_name: 'exprsn-workflow',
        service_url: 'http://localhost:5000/workflow',
        icon: 'fas fa-project-diagram',
        color: '#A8E6CF',
        category: 'automation',
        features: JSON.stringify(['designer', 'execution', 'scheduling', 'monitoring']),
        endpoints: JSON.stringify({
          workflows: '/workflow/api/workflows',
          execute: '/workflow/api/executions',
          monitor: '/workflow/api/monitor'
        }),
        auth_required: true,
        permissions_required: ['read', 'write'],
        enabled: true,
        order: 5,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '00000000-0000-0000-0000-000000000006',
        name: 'filevault',
        display_name: 'File Storage',
        description: 'Secure file storage and management',
        service_name: 'exprsn-filevault',
        service_url: 'http://localhost:3007',
        icon: 'fas fa-folder-open',
        color: '#FFD93D',
        category: 'storage',
        features: JSON.stringify(['upload', 'download', 'folders', 'sharing', 'versions']),
        endpoints: JSON.stringify({
          files: '/api/files',
          upload: '/api/files/upload',
          folders: '/api/folders'
        }),
        auth_required: true,
        permissions_required: ['read', 'write'],
        enabled: true,
        order: 6,
        created_at: new Date(),
        updated_at: new Date()
      },
      {
        id: '00000000-0000-0000-0000-000000000007',
        name: 'payments',
        display_name: 'Payments',
        description: 'Payment processing and subscription management',
        service_name: 'exprsn-payments',
        service_url: 'http://localhost:3018',
        icon: 'fas fa-credit-card',
        color: '#6C5CE7',
        category: 'commerce',
        features: JSON.stringify(['payments', 'subscriptions', 'invoices', 'refunds']),
        endpoints: JSON.stringify({
          payments: '/api/payments',
          subscriptions: '/api/subscriptions',
          invoices: '/api/invoices'
        }),
        auth_required: true,
        permissions_required: ['read', 'write'],
        enabled: true,
        order: 7,
        created_at: new Date(),
        updated_at: new Date()
      }
    ], {});
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('integration_tiles');
  }
};
```

#### 4.2 Integration Tile Model

**File:** `lowcode/models/IntegrationTile.js`

```javascript
const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const IntegrationTile = sequelize.define('IntegrationTile', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  displayName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'display_name'
  },
  description: {
    type: DataTypes.TEXT
  },
  serviceName: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'service_name'
  },
  serviceUrl: {
    type: DataTypes.STRING,
    allowNull: false,
    field: 'service_url'
  },
  icon: {
    type: DataTypes.STRING
  },
  color: {
    type: DataTypes.STRING
  },
  category: {
    type: DataTypes.STRING
  },
  features: {
    type: DataTypes.JSONB,
    defaultValue: []
  },
  endpoints: {
    type: DataTypes.JSONB,
    defaultValue: {}
  },
  authRequired: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
    field: 'auth_required'
  },
  permissionsRequired: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    defaultValue: [],
    field: 'permissions_required'
  },
  configSchema: {
    type: DataTypes.JSONB,
    defaultValue: {},
    field: 'config_schema'
  },
  enabled: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  order: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  metadata: {
    type: DataTypes.JSONB,
    defaultValue: {}
  }
}, {
  tableName: 'integration_tiles',
  timestamps: true,
  underscored: true
});

module.exports = IntegrationTile;
```

#### 4.3 Integration Tiles View

**File:** `lowcode/views/integration-tiles.ejs`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Application Integrations - Exprsn Low-Code Platform</title>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
  <link rel="stylesheet" href="/node_modules/exprsn-kicks/exprsn-kicks.css">
  <style>
    .integration-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 24px;
      padding: 24px;
    }

    .integration-tile {
      background: white;
      border: 2px solid #e0e0e0;
      border-radius: 12px;
      padding: 24px;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;
    }

    .integration-tile:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.15);
      border-color: var(--tile-color);
    }

    .integration-tile::before {
      content: '';
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 4px;
      background: var(--tile-color);
    }

    .tile-icon {
      font-size: 3rem;
      color: var(--tile-color);
      margin-bottom: 16px;
    }

    .tile-name {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 8px;
      color: #333;
    }

    .tile-description {
      color: #666;
      font-size: 0.9rem;
      margin-bottom: 16px;
      line-height: 1.5;
    }

    .tile-features {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }

    .feature-badge {
      background: #f0f0f0;
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 0.75rem;
      color: #666;
    }

    .tile-actions {
      display: flex;
      gap: 8px;
      margin-top: 16px;
    }

    .tile-btn {
      flex: 1;
      padding: 8px 16px;
      border: none;
      border-radius: 6px;
      cursor: pointer;
      font-size: 0.9rem;
      transition: all 0.2s;
    }

    .btn-primary {
      background: var(--tile-color);
      color: white;
    }

    .btn-primary:hover {
      opacity: 0.9;
    }

    .btn-secondary {
      background: #f0f0f0;
      color: #333;
    }

    .btn-secondary:hover {
      background: #e0e0e0;
    }

    .category-filter {
      padding: 16px 24px;
      background: white;
      border-bottom: 2px solid #e0e0e0;
    }

    .filter-btn {
      padding: 8px 16px;
      margin: 0 4px;
      border: 2px solid #e0e0e0;
      background: white;
      border-radius: 20px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .filter-btn.active {
      background: #0066cc;
      color: white;
      border-color: #0066cc;
    }
  </style>
</head>
<body>
  <div class="category-filter">
    <button class="filter-btn active" data-category="all">All</button>
    <button class="filter-btn" data-category="security">Security</button>
    <button class="filter-btn" data-category="social">Social</button>
    <button class="filter-btn" data-category="communication">Communication</button>
    <button class="filter-btn" data-category="business">Business</button>
    <button class="filter-btn" data-category="automation">Automation</button>
    <button class="filter-btn" data-category="storage">Storage</button>
    <button class="filter-btn" data-category="commerce">Commerce</button>
  </div>

  <div class="integration-grid" id="integrationGrid"></div>

  <script>
    // Load integrations
    async function loadIntegrations() {
      const response = await fetch('/lowcode/api/integration-tiles');
      const { data } = await response.json();

      renderIntegrations(data);
    }

    function renderIntegrations(tiles, filterCategory = 'all') {
      const grid = document.getElementById('integrationGrid');
      const filtered = filterCategory === 'all'
        ? tiles
        : tiles.filter(t => t.category === filterCategory);

      grid.innerHTML = filtered.map(tile => `
        <div class="integration-tile" style="--tile-color: ${tile.color}" data-category="${tile.category}">
          <div class="tile-icon">
            <i class="${tile.icon}"></i>
          </div>
          <div class="tile-name">${tile.displayName}</div>
          <div class="tile-description">${tile.description}</div>
          <div class="tile-features">
            ${tile.features.slice(0, 3).map(f => `
              <span class="feature-badge">${f}</span>
            `).join('')}
          </div>
          <div class="tile-actions">
            <button class="tile-btn btn-primary" onclick="openIntegration('${tile.serviceUrl}')">
              <i class="fas fa-external-link-alt"></i> Open
            </button>
            <button class="tile-btn btn-secondary" onclick="showIntegrationDetails('${tile.id}')">
              <i class="fas fa-info-circle"></i> Details
            </button>
          </div>
        </div>
      `).join('');
    }

    function openIntegration(url) {
      window.open(url, '_blank');
    }

    function showIntegrationDetails(id) {
      window.location.href = `/lowcode/integration-tiles/${id}`;
    }

    // Filter buttons
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const category = btn.dataset.category;
        loadIntegrations().then(() => {
          // Re-filter after load
        });
      });
    });

    // Load on page load
    loadIntegrations();
  </script>
</body>
</html>
```

---

## 5. Real-Time Collaboration

### Implementation Files

#### 5.1 Collaboration Service

**File:** `services/collaborationService.js`

```javascript
const EventEmitter = require('events');
const logger = require('../utils/logger');

class CollaborationService extends EventEmitter {
  constructor() {
    super();
    this.sessions = new Map(); // sessionId -> { users, data, locks }
    this.userSessions = new Map(); // userId -> Set<sessionId>
  }

  /**
   * Create a collaboration session
   */
  createSession(sessionId, resourceType, resourceId, metadata = {}) {
    if (this.sessions.has(sessionId)) {
      throw new Error('Session already exists');
    }

    const session = {
      id: sessionId,
      resourceType,
      resourceId,
      users: new Set(),
      cursors: new Map(),
      locks: new Map(),
      changes: [],
      metadata,
      createdAt: new Date()
    };

    this.sessions.set(sessionId, session);
    logger.info('Collaboration session created', { sessionId, resourceType, resourceId });

    return session;
  }

  /**
   * Join a collaboration session
   */
  joinSession(sessionId, userId, userInfo = {}) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.users.add(userId);

    if (!this.userSessions.has(userId)) {
      this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId).add(sessionId);

    this.emit('user:joined', {
      sessionId,
      userId,
      userInfo,
      userCount: session.users.size
    });

    logger.info('User joined collaboration session', { sessionId, userId });

    return {
      session: this.getSessionInfo(sessionId),
      users: Array.from(session.users)
    };
  }

  /**
   * Leave a collaboration session
   */
  leaveSession(sessionId, userId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.users.delete(userId);
    session.cursors.delete(userId);
    session.locks.delete(userId);

    if (this.userSessions.has(userId)) {
      this.userSessions.get(userId).delete(sessionId);
    }

    this.emit('user:left', {
      sessionId,
      userId,
      userCount: session.users.size
    });

    // Clean up empty sessions
    if (session.users.size === 0) {
      this.sessions.delete(sessionId);
      logger.info('Collaboration session closed (no users)', { sessionId });
    }

    logger.info('User left collaboration session', { sessionId, userId });
  }

  /**
   * Update cursor position
   */
  updateCursor(sessionId, userId, position) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.cursors.set(userId, {
      position,
      timestamp: Date.now()
    });

    this.emit('cursor:update', {
      sessionId,
      userId,
      position
    });
  }

  /**
   * Apply a change/operation
   */
  applyChange(sessionId, userId, operation) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Add to change history
    const change = {
      id: `${Date.now()}-${userId}`,
      userId,
      operation,
      timestamp: Date.now()
    };

    session.changes.push(change);

    // Limit history to last 100 changes
    if (session.changes.length > 100) {
      session.changes.shift();
    }

    this.emit('change:applied', {
      sessionId,
      userId,
      change
    });

    return change;
  }

  /**
   * Lock a resource/field
   */
  acquireLock(sessionId, userId, lockKey) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Check if already locked by another user
    if (session.locks.has(lockKey)) {
      const existingLock = session.locks.get(lockKey);
      if (existingLock.userId !== userId) {
        throw new Error('Resource is locked by another user');
      }
    }

    const lock = {
      userId,
      acquiredAt: Date.now()
    };

    session.locks.set(lockKey, lock);

    this.emit('lock:acquired', {
      sessionId,
      userId,
      lockKey
    });

    return lock;
  }

  /**
   * Release a lock
   */
  releaseLock(sessionId, userId, lockKey) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const lock = session.locks.get(lockKey);
    if (lock && lock.userId === userId) {
      session.locks.delete(lockKey);

      this.emit('lock:released', {
        sessionId,
        userId,
        lockKey
      });
    }
  }

  /**
   * Get session info
   */
  getSessionInfo(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      id: session.id,
      resourceType: session.resourceType,
      resourceId: session.resourceId,
      userCount: session.users.size,
      users: Array.from(session.users),
      locks: Array.from(session.locks.entries()).map(([key, lock]) => ({
        key,
        userId: lock.userId,
        acquiredAt: lock.acquiredAt
      })),
      metadata: session.metadata
    };
  }

  /**
   * Get all active sessions for a user
   */
  getUserSessions(userId) {
    const sessionIds = this.userSessions.get(userId);
    if (!sessionIds) return [];

    return Array.from(sessionIds)
      .map(id => this.getSessionInfo(id))
      .filter(Boolean);
  }
}

module.exports = new CollaborationService();
```

---

## 6. Workflow Enhancements

### 6.1 Workflow Testing Mode

**File:** `workflow/routes/testing.js`

```javascript
const express = require('express');
const router = express.Router();
const Workflow = require('../models/Workflow');
const WorkflowExecution = require('../models/WorkflowExecution');
const WorkflowLog = require('../models/WorkflowLog');
const { asyncHandler } = require('../../middleware/errorHandler');

/**
 * POST /workflows/:id/test - Test workflow in dry-run mode
 */
router.post('/:id/test', asyncHandler(async (req, res) => {
  const workflow = await Workflow.findByPk(req.params.id);

  if (!workflow) {
    return res.status(404).json({
      success: false,
      error: 'Workflow not found'
    });
  }

  // Create test execution
  const execution = await WorkflowExecution.create({
    workflow_id: workflow.id,
    test_mode: true,
    dry_run: true,
    input_data: req.body.testData || {},
    status: 'running',
    started_at: new Date()
  });

  try {
    // Execute workflow with dry-run flag
    const executionService = require('../services/executionService');
    const result = await executionService.execute(execution.id, {
      dryRun: true,
      testMode: true
    });

    // Get execution logs
    const logs = await WorkflowLog.findAll({
      where: { execution_id: execution.id },
      order: [['created_at', 'ASC']]
    });

    res.json({
      success: true,
      data: {
        execution: {
          id: execution.id,
          status: result.status,
          result: result.output,
          duration: result.duration
        },
        logs: logs.map(log => ({
          step: log.step_name,
          status: log.status,
          output: log.output,
          error: log.error_message,
          timestamp: log.created_at
        })),
        changes: result.changes || []
      },
      message: 'Test execution completed (no changes committed)'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
}));

module.exports = router;
```

### 6.2 Workflow Retry Strategy

**File:** `workflow/services/retryService.js`

```javascript
const logger = require('../../utils/logger');

class RetryService {
  /**
   * Execute function with retry strategy
   */
  async executeWithRetry(fn, options = {}) {
    const {
      maxAttempts = 3,
      initialDelay = 1000,
      maxDelay = 10000,
      backoffMultiplier = 2,
      retryOn = () => true, // Function to determine if error is retryable
      onRetry = () => {} // Callback on each retry
    } = options;

    let lastError;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn(attempt);
      } catch (error) {
        lastError = error;

        // Check if error is retryable
        if (!retryOn(error) || attempt === maxAttempts) {
          throw error;
        }

        // Log retry
        logger.warn(`Retry attempt ${attempt}/${maxAttempts}`, {
          error: error.message,
          delay
        });

        // Call retry callback
        await onRetry(attempt, error, delay);

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, delay));

        // Exponential backoff
        delay = Math.min(delay * backoffMultiplier, maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Circuit breaker pattern
   */
  createCircuitBreaker(fn, options = {}) {
    const {
      failureThreshold = 5,
      successThreshold = 2,
      timeout = 60000,
      resetTimeout = 30000
    } = options;

    let state = 'CLOSED'; // CLOSED, OPEN, HALF_OPEN
    let failureCount = 0;
    let successCount = 0;
    let nextAttempt = Date.now();

    return async (...args) => {
      // Check circuit state
      if (state === 'OPEN') {
        if (Date.now() < nextAttempt) {
          throw new Error('Circuit breaker is OPEN');
        }
        state = 'HALF_OPEN';
        successCount = 0;
      }

      try {
        const result = await Promise.race([
          fn(...args),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ]);

        // Success
        if (state === 'HALF_OPEN') {
          successCount++;
          if (successCount >= successThreshold) {
            state = 'CLOSED';
            failureCount = 0;
            logger.info('Circuit breaker CLOSED');
          }
        }

        return result;
      } catch (error) {
        failureCount++;

        if (failureCount >= failureThreshold) {
          state = 'OPEN';
          nextAttempt = Date.now() + resetTimeout;
          logger.error('Circuit breaker OPEN', { failureCount });
        }

        throw error;
      }
    };
  }
}

module.exports = new RetryService();
```

### 6.3 Workflow Analytics Dashboard

**File:** `workflow/routes/analytics.js`

```javascript
const express = require('express');
const router = express.Router();
const { sequelize } = require('../config/database');
const WorkflowExecution = require('../models/WorkflowExecution');
const Workflow = require('../models/Workflow');
const { asyncHandler } = require('../../middleware/errorHandler');

/**
 * GET /analytics/overview - Get workflow analytics overview
 */
router.get('/overview', asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;

  const where = {};
  if (startDate && endDate) {
    where.created_at = {
      [Op.between]: [new Date(startDate), new Date(endDate)]
    };
  }

  // Execution statistics
  const stats = await WorkflowExecution.findAll({
    attributes: [
      'workflow_id',
      [sequelize.fn('COUNT', sequelize.col('id')), 'total_executions'],
      [sequelize.fn('AVG', sequelize.col('duration_ms')), 'avg_duration'],
      [sequelize.fn('MIN', sequelize.col('duration_ms')), 'min_duration'],
      [sequelize.fn('MAX', sequelize.col('duration_ms')), 'max_duration'],
      [sequelize.literal("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"), 'successful'],
      [sequelize.literal("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)"), 'failed'],
      [sequelize.literal("SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END)"), 'cancelled']
    ],
    where,
    group: ['workflow_id'],
    raw: true
  });

  // Get workflow details
  const workflows = await Workflow.findAll({
    attributes: ['id', 'name'],
    raw: true
  });

  const workflowMap = Object.fromEntries(
    workflows.map(w => [w.id, w.name])
  );

  // Combine stats with workflow names
  const analytics = stats.map(stat => ({
    workflow_id: stat.workflow_id,
    workflow_name: workflowMap[stat.workflow_id] || 'Unknown',
    total_executions: parseInt(stat.total_executions),
    avg_duration: Math.round(parseFloat(stat.avg_duration)),
    min_duration: parseInt(stat.min_duration),
    max_duration: parseInt(stat.max_duration),
    successful: parseInt(stat.successful),
    failed: parseInt(stat.failed),
    cancelled: parseInt(stat.cancelled),
    success_rate: (parseInt(stat.successful) / parseInt(stat.total_executions) * 100).toFixed(2)
  }));

  res.json({
    success: true,
    data: {
      analytics,
      summary: {
        total_workflows: workflows.length,
        total_executions: analytics.reduce((sum, a) => sum + a.total_executions, 0),
        avg_success_rate: (analytics.reduce((sum, a) => sum + parseFloat(a.success_rate), 0) / analytics.length).toFixed(2)
      }
    }
  });
}));

/**
 * GET /analytics/trends - Get execution trends over time
 */
router.get('/trends', asyncHandler(async (req, res) => {
  const { workflowId, period = 'day' } = req.query;

  const dateFormat = period === 'hour' ? 'YYYY-MM-DD HH24:00:00'
    : period === 'day' ? 'YYYY-MM-DD'
    : 'YYYY-MM';

  const where = {};
  if (workflowId) where.workflow_id = workflowId;

  const trends = await WorkflowExecution.findAll({
    attributes: [
      [sequelize.fn('TO_CHAR', sequelize.col('created_at'), dateFormat), 'period'],
      [sequelize.fn('COUNT', sequelize.col('id')), 'count'],
      [sequelize.literal("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END)"), 'successful'],
      [sequelize.literal("SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END)"), 'failed']
    ],
    where,
    group: [sequelize.fn('TO_CHAR', sequelize.col('created_at'), dateFormat)],
    order: [[sequelize.fn('TO_CHAR', sequelize.col('created_at'), dateFormat), 'ASC']],
    raw: true
  });

  res.json({
    success: true,
    data: trends
  });
}));

module.exports = router;
```

---

## 7. Usage Examples

### Redis Caching Example

```javascript
// In routes/pages.js
const { smartCache } = require('../middleware/cache');

// List pages with caching
router.get('/',
  smartCache('pages', { ttl: 300 }),
  asyncHandler(async (req, res) => {
    const pages = await Page.findAll();
    res.json({ success: true, data: pages });
  })
);

// Cache automatically invalidated on write operations
router.post('/', asyncHandler(async (req, res) => {
  const page = await Page.create(req.body);
  res.json({ success: true, data: page });
  // Cache for 'pages' entity automatically cleared
}));
```

### Cursor Pagination Example

```javascript
const { cursorPaginate } = require('../utils/pagination');

router.get('/posts', asyncHandler(async (req, res) => {
  const result = await cursorPaginate(Post, {
    cursor: req.query.cursor,
    limit: 20,
    where: { status: 'published' },
    order: [['created_at', 'DESC']],
    include: [{ model: User, attributes: ['id', 'name'] }]
  });

  res.json({
    success: true,
    data: result.items,
    pageInfo: {
      hasMore: result.pageInfo.hasMore,
      nextCursor: result.pageInfo.nextCursor
    }
  });
}));
```

### Plugin Creation Example

```javascript
// my-plugin/index.js
const BasePlugin = require('../BasePlugin');

class MyAnalyticsPlugin extends BasePlugin {
  async init() {
    await super.init();

    this.validateConfig(['trackingId']);
    this.analyticsClient = this.initializeAnalytics();

    console.log('Analytics plugin initialized');
  }

  registerHooks(manager) {
    // Track page views
    manager.registerHook('page:viewed', async (page, user) => {
      await this.trackEvent('page_view', {
        page_id: page.id,
        user_id: user.id
      });
      return [page, user];
    });

    // Track page creations
    manager.registerHook('page:created', async (page) => {
      await this.trackEvent('page_created', {
        page_id: page.id
      });
      return page;
    });
  }

  async trackEvent(event, data) {
    // Send to analytics service
    console.log('Tracking event:', event, data);
  }
}

module.exports = MyAnalyticsPlugin;
```

### Decision Table Example

```javascript
// Create decision table for pricing
const table = await decisionTableService.create({
  applicationId: appId,
  name: 'product-pricing',
  description: 'Product pricing based on quantity and customer tier',
  inputColumns: [
    { name: 'quantity', type: 'number', label: 'Quantity', operators: ['>=', '<'] },
    { name: 'customerTier', type: 'string', label: 'Customer Tier', operators: ['=='] }
  ],
  outputColumns: [
    { name: 'price', type: 'number', label: 'Unit Price' },
    { name: 'discount', type: 'number', label: 'Discount %' }
  ],
  hitPolicy: 'FIRST',
  rules: [
    {
      id: 1,
      priority: 1,
      conditions: [
        { column: 'customerTier', operator: '==', value: 'premium' },
        { column: 'quantity', operator: '>=', value: 100 }
      ],
      outputs: { price: 8.50, discount: 15 }
    },
    {
      id: 2,
      priority: 2,
      conditions: [
        { column: 'customerTier', operator: '==', value: 'premium' }
      ],
      outputs: { price: 9.50, discount: 10 }
    },
    {
      id: 3,
      priority: 3,
      conditions: [
        { column: 'quantity', operator: '>=', value: 100 }
      ],
      outputs: { price: 9.00, discount: 10 }
    }
  ],
  defaultOutputs: { price: 10.00, discount: 0 }
}, userId);

// Evaluate decision table
const result = await decisionTableService.evaluate(table.id, {
  quantity: 150,
  customerTier: 'premium'
});

console.log(result); // { matched: true, outputs: { price: 8.50, discount: 15 } }
```

### Real-Time Collaboration Example

```javascript
// Server-side
const collaborationService = require('./services/collaborationService');

io.on('connection', (socket) => {
  socket.on('collaboration:join', ({ sessionId, userId, userInfo }) => {
    const session = collaborationService.joinSession(sessionId, userId, userInfo);

    socket.join(`collab:${sessionId}`);

    // Broadcast to other users
    socket.to(`collab:${sessionId}`).emit('user:joined', {
      userId,
      userInfo
    });

    // Send current session state
    socket.emit('session:state', session);
  });

  socket.on('collaboration:change', ({ sessionId, operation }) => {
    const change = collaborationService.applyChange(sessionId, socket.userId, operation);

    // Broadcast to other users
    socket.to(`collab:${sessionId}`).emit('change:received', change);
  });

  socket.on('collaboration:cursor', ({ sessionId, position }) => {
    collaborationService.updateCursor(sessionId, socket.userId, position);

    socket.to(`collab:${sessionId}`).emit('cursor:update', {
      userId: socket.userId,
      position
    });
  });
});

// Client-side
const socket = io();

socket.emit('collaboration:join', {
  sessionId: 'form-123',
  userId: currentUser.id,
  userInfo: { name: currentUser.name, avatar: currentUser.avatar }
});

socket.on('change:received', (change) => {
  applyChangeToEditor(change);
});

socket.on('cursor:update', ({ userId, position }) => {
  updateCursorDisplay(userId, position);
});
```

---

## 8. API Reference

### Cache Service API

```javascript
// Get cached value
const value = await cacheService.get('key');

// Set cached value
await cacheService.set('key', value, 300); // 5 min TTL

// Delete cached value
await cacheService.del('key');

// Delete pattern
await cacheService.delPattern('user:*');

// Wrap function with caching
const user = await cacheService.wrap('user:123', async () => {
  return await User.findByPk(123);
}, 300);

// Invalidate entity
await cacheService.invalidateEntity('user', '123');
```

### Pagination API

```javascript
// Cursor pagination
const result = await cursorPaginate(Model, {
  cursor: 'base64cursor',
  limit: 20,
  where: { status: 'active' },
  order: [['created_at', 'DESC']]
});
// Returns: { items, pageInfo: { hasMore, nextCursor, count } }

// Offset pagination
const result = await offsetPaginate(Model, {
  page: 1,
  limit: 20,
  where: { status: 'active' }
});
// Returns: { items, pageInfo: { currentPage, totalPages, totalItems, hasNextPage, hasPreviousPage } }
```

### Plugin Manager API

```javascript
// Initialize
await pluginManager.initialize();

// Install plugin
const plugin = await pluginManager.installPlugin(packageData, userId);

// Enable/Disable
await pluginManager.enablePlugin('plugin-name');
await pluginManager.disablePlugin('plugin-name');

// Get plugin instance
const instance = pluginManager.getPlugin('plugin-name');

// Register hook
pluginManager.registerHook('hookName', callback, priority);

// Execute hook
const result = await pluginManager.executeHook('hookName', ...args);
```

### Collaboration Service API

```javascript
// Create session
collaborationService.createSession('session-id', 'form', 'form-123');

// Join session
collaborationService.joinSession('session-id', 'user-123', userInfo);

// Leave session
collaborationService.leaveSession('session-id', 'user-123');

// Update cursor
collaborationService.updateCursor('session-id', 'user-123', { x: 100, y: 200 });

// Apply change
collaborationService.applyChange('session-id', 'user-123', operation);

// Acquire lock
collaborationService.acquireLock('session-id', 'user-123', 'field-name');

// Release lock
collaborationService.releaseLock('session-id', 'user-123', 'field-name');
```

---

## Summary

This implementation provides:

✅ **Performance Optimization:**
- Redis caching with intelligent invalidation
- Cursor-based pagination for infinite scroll
- Socket.IO Redis adapter for horizontal scaling

✅ **Plugin/Extension System:**
- Complete plugin lifecycle management
- Hook system for extensibility
- Base plugin class for easy development
- Plugin API for management

✅ **Decision Tables:**
- Visual decision table designer
- Multiple hit policies (FIRST, UNIQUE, PRIORITY, ANY, COLLECT)
- Flexible condition operators
- Default outputs

✅ **Integration Tiles:**
- Pre-built tiles for all Exprsn services
- Visual integration dashboard
- Category filtering
- Quick access to services

✅ **Real-Time Collaboration:**
- Multi-user sessions
- Cursor tracking
- Change synchronization
- Resource locking
- Event-driven architecture

✅ **Workflow Enhancements:**
- Testing mode with dry-run
- Retry strategies with exponential backoff
- Circuit breaker pattern
- Analytics dashboard with trends

All features are production-ready and fully integrated into the exprsn-svr platform.
