# Exprsn Kicks Integration Plan
## Visual Node-Based Workflow System for Low-Code Platform

**Version:** 1.0.0
**Date:** 2024-12-24
**Status:** Planning Phase

---

## Executive Summary

This document outlines the integration plan for **Exprsn Kicks** (visual node-based programming platform) with the **Exprsn Low-Code Platform**. The integration will provide users with a powerful visual workflow automation system that complements the existing BPMN 2.0 Process Designer.

### Key Benefits

✅ **Enhanced Workflow Capabilities** - 20+ pre-built workflow nodes
✅ **Visual Programming** - Drag-and-drop data flow builder
✅ **Real-time Execution** - Live data processing and visualization
✅ **Zero External Dependencies** - Pure JavaScript, self-contained
✅ **Developer-Friendly** - Easy to extend with custom nodes
✅ **Production-Ready** - Sandboxed execution, XSS/SSRF protection

---

## Table of Contents

1. [Overview](#overview)
2. [Exprsn Kicks Capabilities](#exprsn-kicks-capabilities)
3. [Integration Architecture](#integration-architecture)
4. [Implementation Plan](#implementation-plan)
5. [Use Cases](#use-cases)
6. [Custom Node Development](#custom-node-development)
7. [Migration Strategy](#migration-strategy)
8. [Security Considerations](#security-considerations)
9. [Performance Optimization](#performance-optimization)
10. [Rollout Plan](#rollout-plan)

---

## Overview

### Current State: Low-Code Platform

The Exprsn Low-Code Platform currently provides:

**Designers:**
- Entity Designer (database schema)
- Form Designer (27 components, 7 integration systems)
- Grid Designer (data grids with templates)
- **Process Designer** (BPMN 2.0 workflows)
- Chart Designer (6 chart types)
- Dashboard Designer (9 widget types)

**Runtime:**
- Process Monitor (execution tracking)
- Task Inbox (user tasks)
- Application Runner

### Exprsn Kicks Overview

**Exprsn Kicks** is a visual node-based programming platform with:

**Core Features:**
- Visual node editor with drag-and-drop
- Data flow execution engine
- 20+ built-in workflow nodes
- Undo/redo (50 states)
- Dark mode support
- Touch gestures (mobile-ready)
- Auto-save to localStorage
- Import/export (JSON format)

**Technical Specs:**
- Zero dependencies (vanilla JavaScript)
- Bundle size: ~106KB (minified + gzipped)
- Browser support: Chrome 90+, Edge 90+, Firefox 88+, Safari 14+
- Security: Sandboxed code execution, XSS/SSRF protection
- Performance: 60 FPS zoom/pan, <100ms for 50-node graphs

---

## Exprsn Kicks Capabilities

### Available Node Types

#### **1. Input/Output Nodes**
- **Input Source** - Data entry point
- **Output Sink** - Data exit point
- **Constant** - Fixed value provider

#### **2. Network Nodes**
- **HTTP Request** - REST API calls (GET, POST, PUT, DELETE)
  - Timeout support (default: 30s)
  - Retry mechanism (configurable)
  - Header/body customization
  - SSRF protection built-in

#### **3. Control Flow Nodes**
- **Condition** - If/else branching based on expressions
- **Loop** - Array iteration with index tracking
- **Delay** - Time-based delays (milliseconds)
- **Timer** - Scheduled execution triggers

#### **4. Data Operations**
- **Merge** - Combine multiple inputs
- **Extract** - Get nested object properties (JSONPath)
- **Filter** - Array filtering with predicates
- **Map** - Array transformation
- **Reduce** - Array aggregation

#### **5. Math & Text**
- **Math** - 8 operations (+, -, *, /, %, ^, min, max)
- **String** - 8 operations (concat, split, replace, etc.)
- **Random** - Random number generation

#### **6. Utilities**
- **Console Log** - Debug output to browser console
- **Code Execution** - Custom JavaScript (sandboxed in Web Worker)
- **Chart Visualization** - Inline data charts (Chart.js integration)

---

## Integration Architecture

### Three Integration Approaches

We propose a **hybrid approach** that offers maximum flexibility:

#### **Approach 1: Replace Process Designer** (NOT RECOMMENDED)
- Remove current BPMN 2.0 Process Designer
- Use Exprsn Kicks exclusively for all workflows
- **Pros:** Single workflow system, simpler codebase
- **Cons:** Loses BPMN 2.0 compliance, breaks existing processes

#### **Approach 2: Complement Process Designer** (RECOMMENDED)
- Keep BPMN 2.0 Process Designer for formal business processes
- Add Exprsn Kicks as "Visual Workflow Designer" for data flows
- **Pros:** Best of both worlds, gradual adoption
- **Cons:** Two workflow systems to maintain

#### **Approach 3: Embed Kicks in Process Designer** (ADVANCED)
- Use Exprsn Kicks as script task implementation in BPMN
- BPMN provides high-level orchestration
- Kicks provides detailed data transformations
- **Pros:** Unified UI, leverages both engines
- **Cons:** Complex integration, steep learning curve

### Recommended Architecture: Approach 2

```
Low-Code Platform
├── Entity Designer (Database)
├── Form Designer (UI)
├── Grid Designer (Data Views)
├── Process Designer (BPMN 2.0) ← Business processes, human tasks
├── Visual Workflow Designer (Exprsn Kicks) ← NEW: Data flows, automations
├── Chart Designer (Visualizations)
└── Dashboard Designer (Dashboards)
```

**Separation of Concerns:**

| BPMN Process Designer | Visual Workflow Designer (Kicks) |
|----------------------|----------------------------------|
| Business process modeling | Data flow programming |
| Human-in-the-loop workflows | Automated data processing |
| BPMN 2.0 compliance | Custom logic and transformations |
| Sequential/parallel tasks | Node-based data pipelines |
| Long-running processes | Real-time/short-lived operations |
| User task management | API integrations |

---

## Implementation Plan

### Phase 1: Core Integration (Week 1-2)

#### Step 1.1: Add Exprsn Kicks to Low-Code Platform

**Install Package:**
```bash
cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr
npm install exprsn-kicks --save
```

**Alternative: Local Linking (Development)**
```bash
cd ~/Projects/exprsn-kicks
npm link

cd /Users/rickholland/Downloads/Exprsn/src/exprsn-svr
npm link exprsn-kicks
```

#### Step 1.2: Create Visual Workflow Model

**File:** `/lowcode/models/VisualWorkflow.js`

```javascript
const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VisualWorkflow = sequelize.define('VisualWorkflow', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    displayName: {
      type: DataTypes.STRING,
      allowNull: false
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'applications',
        key: 'id'
      }
    },

    status: {
      type: DataTypes.ENUM('draft', 'published', 'archived'),
      defaultValue: 'draft'
    },

    // Exprsn Kicks graph definition
    graphData: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Exprsn Kicks graph nodes, connections, and state'
    },

    // Execution settings
    executionSettings: {
      type: DataTypes.JSONB,
      defaultValue: {
        autoSave: true,
        maxExecutionTime: 30000,
        retryOnError: false,
        logLevel: 'info'
      }
    },

    createdBy: {
      type: DataTypes.UUID,
      allowNull: true
    },

    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1
    }
  }, {
    tableName: 'visual_workflows',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
      { using: 'gin', fields: ['graph_data'] }
    ]
  });

  VisualWorkflow.associate = (models) => {
    VisualWorkflow.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application'
    });
  };

  return VisualWorkflow;
};
```

#### Step 1.3: Create Visual Workflow Service

**File:** `/lowcode/services/VisualWorkflowService.js`

```javascript
const { VisualWorkflow, Application } = require('../models');

class VisualWorkflowService {
  static async getWorkflows(applicationId, options = {}) {
    const { status, page = 1, limit = 50 } = options;
    const where = { applicationId };
    if (status) where.status = status;

    const workflows = await VisualWorkflow.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: parseInt(limit),
      offset: (parseInt(page) - 1) * parseInt(limit)
    });

    const total = await VisualWorkflow.count({ where });

    return {
      success: true,
      data: workflows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    };
  }

  static async getWorkflowById(workflowId) {
    const workflow = await VisualWorkflow.findByPk(workflowId);

    if (!workflow) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'Visual workflow not found'
      };
    }

    return { success: true, data: workflow };
  }

  static async createWorkflow(data, userId = null) {
    const workflow = await VisualWorkflow.create({
      displayName: data.displayName,
      description: data.description,
      applicationId: data.applicationId,
      status: data.status || 'draft',
      graphData: data.graphData || { nodes: [], connections: [] },
      executionSettings: data.executionSettings || {},
      createdBy: userId
    });

    return {
      success: true,
      data: workflow,
      message: 'Visual workflow created successfully'
    };
  }

  static async updateWorkflow(workflowId, data, userId = null) {
    const workflow = await VisualWorkflow.findByPk(workflowId);

    if (!workflow) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'Visual workflow not found'
      };
    }

    const updates = {};
    if (data.displayName !== undefined) updates.displayName = data.displayName;
    if (data.description !== undefined) updates.description = data.description;
    if (data.status !== undefined) updates.status = data.status;
    if (data.graphData !== undefined) updates.graphData = data.graphData;
    if (data.executionSettings !== undefined) updates.executionSettings = data.executionSettings;

    // Increment version on publish
    if (data.status === 'published' && workflow.status !== 'published') {
      updates.version = workflow.version + 1;
    }

    await workflow.update(updates);

    return {
      success: true,
      data: workflow,
      message: 'Visual workflow updated successfully'
    };
  }

  static async deleteWorkflow(workflowId) {
    const workflow = await VisualWorkflow.findByPk(workflowId);

    if (!workflow) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'Visual workflow not found'
      };
    }

    await workflow.destroy();

    return {
      success: true,
      message: 'Visual workflow deleted successfully'
    };
  }

  static async executeWorkflow(workflowId, inputData = {}) {
    const workflow = await VisualWorkflow.findByPk(workflowId);

    if (!workflow) {
      return {
        success: false,
        error: 'NOT_FOUND',
        message: 'Visual workflow not found'
      };
    }

    // Execution is handled client-side by Exprsn Kicks
    // This endpoint could trigger server-side execution if needed

    return {
      success: true,
      message: 'Workflow execution initiated',
      workflowId,
      graphData: workflow.graphData
    };
  }
}

module.exports = VisualWorkflowService;
```

#### Step 1.4: Create API Routes

**File:** `/lowcode/routes/visual-workflows.js`

```javascript
const express = require('express');
const router = express.Router();
const VisualWorkflowService = require('../services/VisualWorkflowService');

// List workflows
router.get('/', async (req, res) => {
  const { applicationId, status, page, limit } = req.query;

  if (!applicationId) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_PARAMETER',
      message: 'applicationId is required'
    });
  }

  const result = await VisualWorkflowService.getWorkflows(applicationId, {
    status, page, limit
  });

  res.json(result);
});

// Get workflow by ID
router.get('/:id', async (req, res) => {
  const result = await VisualWorkflowService.getWorkflowById(req.params.id);

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
});

// Create workflow
router.post('/', async (req, res) => {
  const { displayName, description, applicationId, status, graphData } = req.body;

  if (!displayName || !applicationId) {
    return res.status(400).json({
      success: false,
      error: 'MISSING_FIELDS',
      message: 'displayName and applicationId are required'
    });
  }

  const result = await VisualWorkflowService.createWorkflow({
    displayName, description, applicationId, status, graphData
  }, req.user?.id);

  res.status(201).json(result);
});

// Update workflow
router.put('/:id', async (req, res) => {
  const { displayName, description, status, graphData, executionSettings } = req.body;

  const result = await VisualWorkflowService.updateWorkflow(
    req.params.id,
    { displayName, description, status, graphData, executionSettings },
    req.user?.id
  );

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
});

// Delete workflow
router.delete('/:id', async (req, res) => {
  const result = await VisualWorkflowService.deleteWorkflow(req.params.id);

  if (!result.success) {
    return res.status(404).json(result);
  }

  res.json(result);
});

// Execute workflow
router.post('/:id/execute', async (req, res) => {
  const result = await VisualWorkflowService.executeWorkflow(
    req.params.id,
    req.body.inputData || {}
  );

  res.json(result);
});

module.exports = router;
```

#### Step 1.5: Create Visual Workflow Designer View

**File:** `/lowcode/views/visual-workflow-designer.ejs`

```html
<!DOCTYPE html>
<html lang="en" data-theme="light">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title><%= title %> - Visual Workflow Designer</title>

  <!-- Exprsn Theme -->
  <link rel="stylesheet" href="/css/exprsn-theme.css">
  <link rel="stylesheet" href="/css/lowcode-theme.css">

  <!-- Font Awesome -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">

  <!-- Exprsn Kicks Styles -->
  <link rel="stylesheet" href="/node_modules/exprsn-kicks/dist/styles-pro.css">

  <style>
    .workflow-container {
      display: flex;
      flex-direction: column;
      height: 100vh;
      background: var(--bg-primary);
    }

    .workflow-header {
      background: var(--bg-secondary);
      border-bottom: 1px solid var(--border-color);
      padding: 1rem 1.5rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .workflow-main {
      flex: 1;
      display: grid;
      grid-template-columns: 250px 1fr;
      overflow: hidden;
    }

    .node-library-panel {
      border-right: 1px solid var(--border-color);
      background: var(--bg-secondary);
      overflow-y: auto;
    }

    .workflow-canvas {
      position: relative;
      background: #f8fafc;
    }

    #laceview-workspace {
      width: 100%;
      height: 100%;
    }
  </style>
</head>
<body>
  <div class="workflow-container">
    <!-- Header -->
    <header class="workflow-header">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <a href="/lowcode/applications" class="btn-icon" title="Back">
          <i class="fas fa-arrow-left"></i>
        </a>
        <div>
          <h1 id="workflow-title">
            <% if (workflow) { %>
              <%= workflow.displayName %>
            <% } else { %>
              New Visual Workflow
            <% } %>
          </h1>
        </div>
      </div>
      <div style="display: flex; gap: 0.5rem;">
        <button class="btn btn-secondary" id="execute-btn">
          <i class="fas fa-play"></i> Execute
        </button>
        <button class="btn btn-secondary" id="save-draft-btn">
          <i class="fas fa-save"></i> Save Draft
        </button>
        <button class="btn btn-primary" id="publish-btn">
          <i class="fas fa-check"></i> Publish
        </button>
      </div>
    </header>

    <!-- Main Content -->
    <main class="workflow-main">
      <!-- Node Library Sidebar -->
      <aside class="node-library-panel">
        <div id="node-library"></div>
      </aside>

      <!-- Workflow Canvas -->
      <section class="workflow-canvas">
        <div id="laceview-workspace"></div>
      </section>
    </main>
  </div>

  <!-- Exprsn Kicks Scripts -->
  <script src="/node_modules/exprsn-kicks/dist/laceview.js"></script>
  <script src="/node_modules/exprsn-kicks/dist/workflow-nodes.js"></script>
  <script src="/node_modules/exprsn-kicks/dist/node-library.js"></script>
  <script src="/node_modules/exprsn-kicks/dist/canvas-controller.js"></script>

  <!-- Integration Script -->
  <script src="/lowcode/js/visual-workflow-designer.js"></script>

  <script>
    const workflowData = <%= workflow ? JSON.stringify(workflow) : 'null' %>;
    const appId = '<%= appId %>';

    window.addEventListener('DOMContentLoaded', () => {
      window.workflowDesigner = new VisualWorkflowDesigner({
        workflowData,
        appId
      });
    });
  </script>
</body>
</html>
```

#### Step 1.6: Create Client-Side Integration

**File:** `/lowcode/public/js/visual-workflow-designer.js`

```javascript
/**
 * Visual Workflow Designer - Exprsn Kicks Integration
 */

class VisualWorkflowDesigner {
  constructor(options) {
    this.workflowData = options.workflowData;
    this.appId = options.appId;

    this.config = {
      id: this.workflowData?.id || null,
      name: this.workflowData?.displayName || 'New Visual Workflow',
      applicationId: this.appId
    };

    this.laceView = null;
    this.nodeLibrary = null;
    this.canvasController = null;

    this.init();
  }

  init() {
    // Initialize Exprsn Kicks
    this.laceView = new LaceView('laceview-workspace', {
      width: window.innerWidth - 250,
      height: window.innerHeight - 70,
      darkMode: false,
      autoSave: true,
      gridSize: 20,
      snapToGrid: false
    });

    // Initialize node library
    this.nodeLibrary = new NodeLibrary(this.laceView, 'node-library');

    // Initialize canvas controller
    this.canvasController = new CanvasController(this.laceView);

    // Load existing workflow
    if (this.workflowData?.graphData) {
      this.loadWorkflow(this.workflowData.graphData);
    }

    // Setup event listeners
    this.setupEventListeners();

    // Auto-resize on window resize
    window.addEventListener('resize', () => {
      const newWidth = window.innerWidth - 250;
      const newHeight = window.innerHeight - 70;
      this.laceView.resize(newWidth, newHeight);
    });
  }

  setupEventListeners() {
    // Execute workflow
    document.getElementById('execute-btn').addEventListener('click', () => {
      this.executeWorkflow();
    });

    // Save draft
    document.getElementById('save-draft-btn').addEventListener('click', () => {
      this.saveWorkflow(false);
    });

    // Publish
    document.getElementById('publish-btn').addEventListener('click', () => {
      this.saveWorkflow(true);
    });
  }

  loadWorkflow(graphData) {
    try {
      this.laceView.loadFromJSON(graphData);
    } catch (error) {
      console.error('Failed to load workflow:', error);
      alert('Failed to load workflow: ' + error.message);
    }
  }

  executeWorkflow() {
    try {
      this.laceView.executeGraph();
      this.showNotification('Workflow executed successfully', 'success');
    } catch (error) {
      console.error('Workflow execution failed:', error);
      alert('Workflow execution failed: ' + error.message);
    }
  }

  async saveWorkflow(publish = false) {
    try {
      // Get current graph state
      const graphData = this.laceView.toJSON();

      // Prepare payload
      const payload = {
        displayName: this.config.name,
        applicationId: this.config.applicationId,
        status: publish ? 'published' : 'draft',
        graphData
      };

      // Save or update
      const url = this.config.id
        ? `/lowcode/api/visual-workflows/${this.config.id}`
        : '/lowcode/api/visual-workflows';

      const method = this.config.id ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to save workflow');
      }

      const result = await response.json();

      if (result.success) {
        this.config.id = result.data.id;
        this.showNotification(
          publish ? 'Workflow published!' : 'Workflow saved as draft',
          'success'
        );

        if (publish) {
          setTimeout(() => {
            window.location.href = `/lowcode/designer?appId=${this.appId}`;
          }, 1500);
        }
      }
    } catch (error) {
      console.error('Failed to save workflow:', error);
      alert('Failed to save workflow: ' + error.message);
    }
  }

  showNotification(message, type = 'info') {
    this.laceView.showNotification(message);
  }
}
```

#### Step 1.7: Add Routes to Low-Code Platform

**Update:** `/lowcode/routes/index.js`

```javascript
// Add to imports
const visualWorkflowsRouter = require('./visual-workflows');

// Add to endpoints list
endpoints: {
  // ... existing endpoints
  visualWorkflows: '/lowcode/api/visual-workflows',
}

// Mount router
router.use('/visual-workflows', visualWorkflowsRouter);
```

**Update:** `/lowcode/index.js`

```javascript
/**
 * Visual Workflow Designer - Create new
 */
router.get('/visual-workflows/new', (req, res) => {
  const appId = req.query.appId || null;

  res.render('visual-workflow-designer', {
    title: 'Visual Workflow Designer',
    currentPath: req.path,
    user: req.user || null,
    appId,
    workflow: null
  });
});

/**
 * Visual Workflow Designer - Edit existing
 */
router.get('/visual-workflows/:workflowId/designer', async (req, res) => {
  try {
    const { workflowId } = req.params;

    const VisualWorkflowService = require('./services/VisualWorkflowService');
    const result = await VisualWorkflowService.getWorkflowById(workflowId);

    if (!result.success) {
      return res.status(404).send('Visual workflow not found');
    }

    res.render('visual-workflow-designer', {
      title: `${result.data.displayName} - Visual Workflow Designer`,
      currentPath: req.path,
      user: req.user || null,
      appId: result.data.applicationId,
      workflow: result.data
    });
  } catch (error) {
    console.error('Failed to load visual workflow designer:', error);
    res.status(404).send('Visual workflow not found');
  }
});
```

---

### Phase 2: Custom Low-Code Nodes (Week 3-4)

Create custom Exprsn Kicks nodes that integrate with Low-Code Platform resources:

#### Custom Node 1: Entity Query Node

```javascript
class EntityQueryNode extends Node {
  constructor(id, x, y) {
    super(id, 'Entity Query', x, y, 3, 2,
      ['Entity ID', 'Filters', 'Limit'],
      ['Results', 'Count']
    );

    this.titleColor = '#8b5cf6';  // Purple

    this.executeFn = async (inputs) => {
      const [entityId, filters, limit] = inputs;

      if (!entityId) {
        return [null, 0];
      }

      try {
        const response = await fetch(
          `/lowcode/api/entities/${entityId}/data?limit=${limit || 50}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ filters: filters || {} })
          }
        );

        const data = await response.json();

        if (data.success) {
          return [data.data, data.pagination.total];
        }

        return [null, 0];
      } catch (error) {
        console.error('Entity query failed:', error);
        return [null, 0];
      }
    };
  }
}
```

#### Custom Node 2: Form Submit Node

```javascript
class FormSubmitNode extends Node {
  constructor(id, x, y) {
    super(id, 'Form Submit', x, y, 2, 2,
      ['Form ID', 'Form Data'],
      ['Success', 'Record ID']
    );

    this.titleColor = '#ec4899';  // Pink

    this.executeFn = async (inputs) => {
      const [formId, formData] = inputs;

      if (!formId || !formData) {
        return [false, null];
      }

      try {
        // Assuming forms have runtime submission endpoint
        const response = await fetch(
          `/lowcode/api/runtime/forms/${formId}/submit`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formData)
          }
        );

        const data = await response.json();

        if (data.success) {
          return [true, data.data.id];
        }

        return [false, null];
      } catch (error) {
        console.error('Form submission failed:', error);
        return [false, null];
      }
    };
  }
}
```

#### Custom Node 3: Process Trigger Node

```javascript
class ProcessTriggerNode extends Node {
  constructor(id, x, y) {
    super(id, 'Start Process', x, y, 2, 2,
      ['Process ID', 'Variables'],
      ['Instance ID', 'Status']
    );

    this.titleColor = '#10b981';  // Green

    this.executeFn = async (inputs) => {
      const [processId, variables] = inputs;

      if (!processId) {
        return [null, 'error'];
      }

      try {
        const response = await fetch(
          `/lowcode/api/processes/${processId}/start`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ variables: variables || {} })
          }
        );

        const data = await response.json();

        if (data.success) {
          return [data.data.instanceId, data.data.status];
        }

        return [null, 'error'];
      } catch (error) {
        console.error('Process start failed:', error);
        return [null, 'error'];
      }
    };
  }
}
```

#### Custom Node 4: JSONLex Evaluation Node

```javascript
class JSONLexNode extends Node {
  constructor(id, x, y) {
    super(id, 'JSONLex', x, y, 2, 1,
      ['Expression', 'Context'],
      ['Result']
    );

    this.titleColor = '#f59e0b';  // Orange

    this.executeFn = async (inputs) => {
      const [expression, context] = inputs;

      if (!expression) {
        return [null];
      }

      try {
        const response = await fetch(
          `/lowcode/api/formulas/evaluate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              expression,
              context: context || {}
            })
          }
        );

        const data = await response.json();

        if (data.success) {
          return [data.result];
        }

        return [null];
      } catch (error) {
        console.error('JSONLex evaluation failed:', error);
        return [null];
      }
    };
  }
}
```

---

### Phase 3: Node Library Package (Week 5-6)

Create a custom node library file that registers all Low-Code specific nodes:

**File:** `/lowcode/public/js/lowcode-workflow-nodes.js`

```javascript
/**
 * Low-Code Platform Custom Nodes for Exprsn Kicks
 */

// Register all custom nodes
const LowCodeNodeLibrary = {
  nodes: [
    {
      type: 'EntityQueryNode',
      category: 'Low-Code',
      icon: 'database',
      class: EntityQueryNode
    },
    {
      type: 'FormSubmitNode',
      category: 'Low-Code',
      icon: 'file-alt',
      class: FormSubmitNode
    },
    {
      type: 'ProcessTriggerNode',
      category: 'Low-Code',
      icon: 'play-circle',
      class: ProcessTriggerNode
    },
    {
      type: 'JSONLexNode',
      category: 'Low-Code',
      icon: 'code',
      class: JSONLexNode
    },
    {
      type: 'GridDataNode',
      category: 'Low-Code',
      icon: 'table',
      class: GridDataNode
    },
    {
      type: 'ChartRenderNode',
      category: 'Low-Code',
      icon: 'chart-bar',
      class: ChartRenderNode
    }
  ],

  register(laceView) {
    // Add all nodes to Exprsn Kicks instance
    this.nodes.forEach(node => {
      laceView.registerNodeType(node.type, node.class);
    });
  }
};

// Auto-register on load
if (typeof window !== 'undefined' && window.LaceView) {
  window.LowCodeNodeLibrary = LowCodeNodeLibrary;
}
```

---

## Use Cases

### Use Case 1: API Data Processing Pipeline

**Scenario:** Fetch customer data from external API, transform it, and save to entity

**Workflow:**
1. **HTTP Request Node** - GET from `https://api.example.com/customers`
2. **Extract Node** - Get `data.customers` array
3. **Map Node** - Transform fields to match entity schema
4. **Loop Node** - Iterate through customers
5. **Entity Create Node** - Save each customer to Low-Code entity

**Business Value:** Automated data synchronization without custom code

---

### Use Case 2: Form Submission Automation

**Scenario:** When form is submitted, trigger approval process and send notification

**Workflow:**
1. **Form Submit Node** - Capture form submission
2. **Condition Node** - Check if amount > $1000
3. **Process Trigger Node** - Start "Approval Workflow" process
4. **HTTP Request Node** - POST to Herald notification service
5. **Output Node** - Return confirmation

**Business Value:** Zero-code business process automation

---

### Use Case 3: Real-time Data Transformation

**Scenario:** Process incoming webhook data and update dashboard

**Workflow:**
1. **Input Node** - Webhook payload
2. **Extract Node** - Get relevant fields
3. **Math Node** - Calculate totals
4. **Chart Render Node** - Generate visualization
5. **Dashboard Update Node** - Update dashboard widget

**Business Value:** Real-time data visualization without backend code

---

### Use Case 4: Scheduled Data Export

**Scenario:** Daily export of entity data to CSV and email

**Workflow:**
1. **Timer Node** - Trigger at 2:00 AM daily
2. **Entity Query Node** - Get all records from yesterday
3. **Map Node** - Format for CSV
4. **Code Execution Node** - Generate CSV string
5. **HTTP Request Node** - POST to file storage API
6. **HTTP Request Node** - POST to email service

**Business Value:** Automated reporting without cron jobs

---

## Custom Node Development

### Node Development Template

```javascript
class CustomNode extends Node {
  constructor(id, x, y) {
    // Define node structure
    super(id, 'Node Title', x, y,
      numInputs,     // Number of input ports
      numOutputs,    // Number of output ports
      inputLabels,   // Array of input names
      outputLabels   // Array of output names
    );

    // Visual customization
    this.titleColor = '#4a90e2';  // Node color

    // Node-specific properties
    this.properties = {
      setting1: 'default value',
      setting2: true
    };

    // Execution logic
    this.executeFn = async (inputs) => {
      // inputs[0] = first input value
      // inputs[1] = second input value, etc.

      try {
        // Process inputs
        const result = await this.processData(inputs);

        // Return outputs (array matching numOutputs)
        return [result, 'success'];

      } catch (error) {
        console.error('Node execution failed:', error);
        return [null, 'error'];
      }
    };
  }

  async processData(inputs) {
    // Custom processing logic
    return inputs[0];
  }
}
```

### Best Practices

**1. Error Handling:**
- Always wrap execution in try/catch
- Return appropriate default values on error
- Log errors to console for debugging

**2. Async Operations:**
- Use `async/await` for HTTP requests
- Set reasonable timeouts (30s default)
- Handle network failures gracefully

**3. Input Validation:**
- Check for required inputs
- Validate data types
- Provide clear error messages

**4. Performance:**
- Avoid heavy computations in UI thread
- Use Web Workers for CPU-intensive tasks
- Cache expensive operations

**5. Security:**
- Sanitize all user inputs
- Validate URLs to prevent SSRF
- Use Content Security Policy
- Never execute arbitrary code without sandboxing

---

## Migration Strategy

### Option A: Gradual Rollout

**Phase 1:** Introduce as experimental feature
- Add "Visual Workflow Designer" to designer menu
- Mark as "Beta" or "Preview"
- Limit to development environments only

**Phase 2:** User testing and feedback
- Select 5-10 pilot users
- Collect usage metrics
- Iterate based on feedback

**Phase 3:** Production rollout
- Remove beta label
- Add to documentation
- Announce in release notes

**Phase 4:** Deprecation decision (Optional)
- Evaluate usage vs. BPMN Process Designer
- Decide whether to maintain both or consolidate
- Provide migration tools if deprecating one

### Option B: Side-by-Side Coexistence

Keep both designers permanently:

**BPMN Process Designer** → For compliance-heavy use cases
**Visual Workflow Designer** → For rapid automation and data flows

Users choose based on their needs.

---

## Security Considerations

### 1. Code Execution Sandboxing

Exprsn Kicks already includes Web Worker sandboxing for custom code nodes:

```javascript
// Already implemented in Exprsn Kicks
const worker = new Worker('code-executor-worker.js');
worker.postMessage({ code, input, timeout: 5000 });
```

**Additional Safeguards:**
- Set maximum execution time (5s)
- Memory limits
- CPU throttling
- Terminate on timeout

### 2. SSRF Prevention

**HTTP Request Node Security:**
- Block localhost/private IPs
- Whitelist allowed protocols (http, https only)
- Validate URLs before execution
- Rate limiting on outbound requests

Already implemented in Exprsn Kicks:

```javascript
isValidURL(urlString) {
  const url = new URL(urlString);

  // Block dangerous protocols
  if (!['http:', 'https:'].includes(url.protocol)) {
    return false;
  }

  // Block private IPs and localhost
  const hostname = url.hostname;
  const privateRanges = [
    'localhost', '127.0.0.1', '0.0.0.0',
    '10.', '172.16.', '192.168.'
  ];

  if (privateRanges.some(range => hostname.startsWith(range))) {
    return false;
  }

  return true;
}
```

### 3. XSS Protection

All user-generated content is sanitized:

```javascript
// Use createElement + textContent (not innerHTML)
const element = document.createElement('div');
element.textContent = userInput;  // Safe
```

### 4. Data Access Control

**Custom Node Security:**
- Validate entity permissions before queries
- Check form submission permissions
- Verify process trigger permissions
- Audit all data access

**Implementation:**

```javascript
async executeFn(inputs) {
  const [entityId] = inputs;

  // Verify user has read permission
  const hasPermission = await this.checkPermission(entityId, 'read');
  if (!hasPermission) {
    return [null, 'Permission denied'];
  }

  // Proceed with query
  // ...
}
```

---

## Performance Optimization

### 1. Lazy Loading

Load Exprsn Kicks only on designer pages:

```html
<!-- Only load on /visual-workflows/* pages -->
<script src="/node_modules/exprsn-kicks/dist/laceview.js" defer></script>
```

### 2. Bundle Optimization

Exprsn Kicks is already optimized:
- Core: 52KB (gzipped)
- Workflow Nodes: 22KB
- Total: ~106KB

**No additional optimization needed.**

### 3. Graph Execution Performance

For large graphs (50+ nodes):
- Topological sort for execution order
- Parallel execution where possible
- Debounce auto-save (500ms)
- Limit undo history (50 states)

### 4. Canvas Rendering

Exprsn Kicks uses SVG for high performance:
- 60 FPS zoom/pan
- Hardware-accelerated transforms
- Virtual rendering for large graphs (render only visible nodes)

---

## Rollout Plan

### Timeline

| Phase | Duration | Milestones |
|-------|----------|-----------|
| **Phase 1** | Week 1-2 | Core integration, basic UI |
| **Phase 2** | Week 3-4 | Custom nodes, testing |
| **Phase 3** | Week 5-6 | Node library, documentation |
| **Phase 4** | Week 7-8 | Beta testing, feedback iteration |
| **Phase 5** | Week 9-10 | Production rollout, training |

### Success Metrics

**Adoption:**
- \# of visual workflows created
- \# of active users
- \# of workflow executions

**Performance:**
- Average execution time
- Success rate
- Error rate

**Satisfaction:**
- User feedback scores
- Support ticket volume
- Feature requests

### Training Materials

**Documentation:**
- Getting Started Guide
- Node Reference
- Video tutorials
- Example workflows

**Support:**
- In-app help
- Community forum
- Support tickets

---

## Conclusion

The integration of **Exprsn Kicks** into the **Exprsn Low-Code Platform** will provide users with a powerful visual workflow automation system that complements the existing BPMN 2.0 Process Designer.

**Key Takeaways:**

✅ **Hybrid Approach:** Keep both BPMN and Visual Workflow designers
✅ **Custom Nodes:** Build Low-Code specific nodes for entities, forms, processes
✅ **Security First:** Leverage built-in sandboxing and SSRF protection
✅ **Gradual Rollout:** Beta → Pilot → Production
✅ **Zero Dependencies:** No external libraries, minimal bundle size

**Next Steps:**

1. Review this integration plan
2. Prioritize phases based on business needs
3. Allocate development resources
4. Begin Phase 1 implementation
5. Set up beta testing program

---

**Questions or Feedback?**

Contact: engineering@exprsn.com

---

**End of Integration Plan**
