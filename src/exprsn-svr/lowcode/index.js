/**
 * ═══════════════════════════════════════════════════════════
 * Exprsn Low-Code Platform - Main Router
 * Handles view routes and API mounting
 * ═══════════════════════════════════════════════════════════
 */

const express = require('express');
const path = require('path');
const router = express.Router();

// Import API routes
const apiRoutes = require('./routes/index');

// Import setup routes
const setupRoutes = require('./routes/setup');
const setupConfigRoutes = require('./routes/setup-config');

// Import report page routes
const reportPagesRoutes = require('./routes/reportPages');

/**
 * Configure view engine for lowcode subdirectory
 */
function configureLowCodeViews(app) {
  // Add lowcode views directory to views array
  const viewsPath = path.join(__dirname, 'views');
  const existingViews = app.get('views');

  if (Array.isArray(existingViews)) {
    app.set('views', [...existingViews, viewsPath]);
  } else {
    app.set('views', [existingViews, viewsPath]);
  }
}

/**
 * Setup Wizard - System configuration (no auth required)
 * Must be mounted BEFORE other routes
 */
router.use('/setup', setupRoutes);

/**
 * Setup Configuration - Advanced platform configuration
 * Includes Services, Databases, Redis, Security, Forge, Low-Code, etc.
 * No auth required in dev mode (LOW_CODE_DEV_AUTH=true)
 */
router.use('/setup-config', setupConfigRoutes);

/**
 * Landing page - Low-Code Platform home
 * Redirects to applications page for now
 */
router.get('/', (req, res) => {
  res.redirect('/lowcode/applications');
});

/**
 * Application Designer Hub - Main design interface for a specific app
 */
router.get('/designer', (req, res) => {
  const appId = req.query.appId;

  if (!appId) {
    // No appId provided, redirect to applications list
    return res.redirect('/lowcode/applications');
  }

  res.render('app-designer-enhanced', {
    title: 'Application Designer',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Applications comparison page
 * Shows side-by-side comparison of V1 vs V2
 */
router.get('/applications/compare', (req, res) => {
  res.render('applications-compare', {
    title: 'Compare Dashboards - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Applications management page
 * Query param ?version=v2 shows new redesigned dashboard
 * Query param ?version=v1 or no version shows original wizard-based interface
 */
router.get('/applications', (req, res) => {
  const version = req.query.version || 'v1';
  const viewName = version === 'v2' ? 'applications-v2' : 'applications';

  res.render(viewName, {
    title: 'Applications - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    version
  });
});

/**
 * HTML Projects - List all HTML projects
 */
router.get('/html-projects', (req, res) => {
  res.render('html-projects', {
    title: 'HTML Projects - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * HTML Designer - Visual HTML application builder
 */
router.get('/html-designer', (req, res) => {
  const { projectId } = req.query;

  if (!projectId) {
    return res.redirect('/lowcode/html-projects');
  }

  res.render('html-designer', {
    title: 'HTML Designer - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    projectId
  });
});

/**
 * HTML Visual Designer - Wix-style drag & drop builder
 */
router.get('/html-visual-designer', (req, res) => {
  const { projectId } = req.query;

  if (!projectId) {
    return res.redirect('/lowcode/html-projects');
  }

  res.render('html-visual-designer', {
    title: 'Visual Designer - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    projectId
  });
});

/**
 * HTML Visual Designer Pro - Professional WYSIWYG designer
 * Dreamweaver-style editor with 60+ components, collapsible sidebars,
 * element/layer browser, container nesting, and high-resolution support
 */
router.get('/html-visual-designer-pro', (req, res) => {
  const { projectId } = req.query;

  if (!projectId) {
    return res.redirect('/lowcode/html-projects');
  }

  res.render('html-visual-designer-pro', {
    title: 'Visual Designer Pro - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    projectId,
    project: null // Will be loaded by frontend
  });
});

/**
 * HTML IDE - Full-featured development environment
 */
router.get('/html-ide', (req, res) => {
  const { projectId } = req.query;

  if (!projectId) {
    return res.redirect('/lowcode/html-projects');
  }

  res.render('html-ide', {
    title: 'HTML IDE - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    projectId
  });
});

/**
 * HTML Component Marketplace - Browse and manage components
 */
router.get('/html-components', (req, res) => {
  res.render('html-component-marketplace', {
    title: 'Component Marketplace - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Function Builder - Excel/Power Query/R-like function system
 */
router.get('/function-builder', (req, res) => {
  res.render('function-builder', {
    title: 'Function Builder - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Git Setup & Configuration - Main dashboard
 */
router.get('/git/dashboard', (req, res) => {
  res.render('git-setup-dashboard', {
    title: 'Git Setup & Configuration - Exprsn',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Git Setup - System Configuration
 */
router.get('/git/setup/config', (req, res) => {
  res.render('git-setup-config', {
    title: 'System Configuration - Git Setup',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Git Setup - Authentication Management
 */
router.get('/git/auth', (req, res) => {
  res.render('git-auth-manager', {
    title: 'Authentication Management - Git Setup',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Git Setup - Repository Policies
 */
router.get('/git/policies', (req, res) => {
  res.render('git-policy-manager', {
    title: 'Repository Policies - Git Setup',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Git Setup - CI/CD Runners
 */
router.get('/git/runners', (req, res) => {
  res.render('git-runner-dashboard', {
    title: 'CI/CD Runners - Git Setup',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Git Setup - Security Scanning
 */
router.get('/git/security', (req, res) => {
  res.render('git-security-scanner', {
    title: 'Security Scanning - Git Setup',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Git Setup - Deployment Environments
 */
router.get('/git/environments', (req, res) => {
  res.render('git-environments', {
    title: 'Deployment Environments - Git Setup',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Git Repositories - Version control and CI/CD
 */
router.get('/git-repositories', (req, res) => {
  res.render('git-repositories', {
    title: 'Git Repositories - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Function Builder IDE - Comprehensive formula editor with execution engine
 */
router.get('/function-builder-ide', (req, res) => {
  res.render('function-builder-ide', {
    title: 'Function Builder IDE - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Entity Designer - Enhanced with Pro features
 * PRIMARY ENTITY DESIGNER (upgraded to Pro version with all enhancements)
 */
router.get('/entity-designer', (req, res) => {
  const appId = req.query.appId || null;
  const entityId = req.query.entityId || null;

  if (!appId) {
    return res.redirect('/lowcode/applications');
  }

  // Now renders the Pro version with all enhancements:
  // - Enhanced Field Modal with 25+ field types
  // - Visual Enum Editor
  // - JSON Schema Builder
  // - JSONLex Expression Builder
  // - Color Picker Widget
  // - Index Field Table Builder
  // - Entity Locking and Read-Only Mode
  // - Migration Generator with Versioning
  // - CRUD Generator with Auto-Migration
  // - Schema Diff & Conflict Detection
  // - Rollback & Recovery Tools
  res.render('entity-designer-pro', {
    title: 'Entity Designer - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId,
    entityId
  });
});

/**
 * Entity Designer Pro - Enhanced entity designer with real-time collaboration
 */
router.get('/entity-designer-pro', (req, res) => {
  const appId = req.query.appId || null;

  if (!appId) {
    return res.redirect('/lowcode/applications');
  }

  res.render('entity-designer-pro', {
    title: 'Entity Designer Pro - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Grid designer page - Create new grid
 */
router.get('/grids/new', (req, res) => {
  const appId = req.query.appId || null;

  res.render('grid-designer', {
    title: 'Grid Designer - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    applicationId: appId,
    grid: null
  });
});

/**
 * Grid designer page - Edit existing grid
 */
router.get('/grids/:gridId/designer', async (req, res) => {
  try {
    const { gridId } = req.params;

    // Load grid data
    const GridService = require('./services/GridService');
    const grid = await GridService.getGridById(gridId);

    res.render('grid-designer', {
      title: `${grid.displayName} - Grid Designer`,
      currentPath: req.path,
      user: req.user || null,
      applicationId: grid.applicationId,
      grid
    });
  } catch (error) {
    console.error('Failed to load grid designer:', error);
    res.status(404).send('Grid not found');
  }
});

/**
 * Forms Manager - List and manage all forms for an application
 */
router.get('/forms', (req, res) => {
  const appId = req.query.appId || null;

  if (!appId) {
    return res.redirect('/lowcode/applications');
  }

  res.render('forms-manager', {
    title: 'Forms Manager - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Form designer page - Create new form
 */
router.get('/forms/new', (req, res) => {
  const appId = req.query.appId || null;

  res.render('form-designer-pro', {
    title: 'Form Designer - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId: appId,
    formId: null,
    form: null
  });
});

/**
 * Form designer page - Edit existing form
 */
router.get('/forms/:formId/designer', async (req, res) => {
  try {
    const { formId } = req.params;

    // Load form data
    const FormService = require('./services/FormService');
    const form = await FormService.getFormById(formId);

    res.render('form-designer-pro', {
      title: `${form.displayName} - Form Designer`,
      currentPath: req.path,
      user: req.user || null,
      appId: form.applicationId,
      formId: formId,
      form
    });
  } catch (error) {
    console.error('Failed to load form designer:', error);
    res.status(404).send('Form not found');
  }
});

/**
 * Queries Manager - List and manage all queries for an application
 */
router.get('/queries', (req, res) => {
  const appId = req.query.appId || null;

  if (!appId) {
    return res.redirect('/lowcode/applications');
  }

  res.render('queries-manager', {
    title: 'Visual Queries - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Query designer page - Create new query
 */
router.get('/queries/new', (req, res) => {
  const appId = req.query.appId || null;

  res.render('query-designer', {
    title: 'Query Designer - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId: appId,
    queryId: null,
    query: null
  });
});

/**
 * Query designer page - Edit existing query
 */
router.get('/queries/:queryId/designer', async (req, res) => {
  try {
    const { queryId } = req.params;

    // Load query data
    const QueryService = require('./services/QueryService');
    const query = await QueryService.getQueryById(queryId);

    res.render('query-designer', {
      title: `${query.name} - Query Designer`,
      currentPath: req.path,
      user: req.user || null,
      appId: query.applicationId,
      queryId: queryId,
      query
    });
  } catch (error) {
    console.error('Failed to load query designer:', error);
    res.status(404).send('Query not found');
  }
});

/**
 * Datasource designer page - Create new datasource
 */
router.get('/datasources/new', async (req, res) => {
  const { appId } = req.query;

  res.render('datasource-designer', {
    title: 'New Data Source',
    currentPath: req.path,
    user: req.user || null,
    appId: appId || req.query.applicationId,
    datasourceId: null,
    datasource: null
  });
});

/**
 * Datasource designer page - Edit existing datasource
 */
router.get('/datasources/:datasourceId/designer', async (req, res) => {
  try {
    const { datasourceId } = req.params;
    const { appId } = req.query;
    const db = require('./models');

    // Load datasource data
    const datasource = await db.DataSource.findByPk(datasourceId);

    if (!datasource) {
      return res.status(404).send('Data source not found');
    }

    res.render('datasource-designer', {
      title: `${datasource.displayName} - Data Source Designer`,
      currentPath: req.path,
      user: req.user || null,
      appId: appId || datasource.applicationId,
      datasourceId: datasourceId,
      datasource
    });
  } catch (error) {
    console.error('Failed to load datasource designer:', error);
    res.status(404).send('Data source not found');
  }
});

/**
 * Datasources list page
 */
router.get('/datasources', async (req, res) => {
  const { appId } = req.query;

  res.render('datasources-manager', {
    title: 'Data Sources',
    currentPath: req.path,
    user: req.user || null,
    appId: appId || req.query.applicationId,
    appName: 'Application'
  });
});

/**
 * Process designer page - Create new process
 */
router.get('/processes/new', (req, res) => {
  const appId = req.query.appId || null;

  res.render('process-designer', {
    title: 'Process Designer - Exprsn BPM',
    currentPath: req.path,
    user: req.user || null,
    applicationId: appId,
    process: null
  });
});

/**
 * Process designer page - Edit existing process
 */
router.get('/processes/:processId/designer', async (req, res) => {
  try {
    const { processId } = req.params;

    // Load process data
    const ProcessService = require('./services/ProcessService');
    const result = await ProcessService.getProcess(processId);

    if (!result.success) {
      return res.status(404).send('Process not found');
    }

    res.render('process-designer', {
      title: `${result.process.displayName} - Process Designer`,
      currentPath: req.path,
      user: req.user || null,
      applicationId: result.process.applicationId,
      process: result.process
    });
  } catch (error) {
    console.error('Failed to load process designer:', error);
    res.status(404).send('Process not found');
  }
});

/**
 * Process monitor page - Monitor process execution
 */
router.get('/processes/:processId/monitor', async (req, res) => {
  try {
    const { processId } = req.params;

    // Load process data
    const ProcessService = require('./services/ProcessService');
    const result = await ProcessService.getProcess(processId);

    if (!result.success) {
      return res.status(404).send('Process not found');
    }

    res.render('process-monitor', {
      title: `${result.process.displayName} - Monitor`,
      currentPath: req.path,
      user: req.user || null,
      processId: processId
    });
  } catch (error) {
    console.error('Failed to load process monitor:', error);
    res.status(404).send('Process not found');
  }
});

/**
 * Task inbox page - User task management
 */
router.get('/tasks/inbox', (req, res) => {
  res.render('task-inbox', {
    title: 'Task Inbox',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Chart designer page - Create new chart
 */
router.get('/charts/new', (req, res) => {
  const appId = req.query.appId || null;

  res.render('chart-designer', {
    title: 'Chart Designer - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId,
    chart: null
  });
});

/**
 * Chart designer page - Edit existing chart
 */
router.get('/charts/:chartId/designer', async (req, res) => {
  try {
    const { chartId } = req.params;

    // Load chart data
    const ChartService = require('./services/ChartService');
    const result = await ChartService.getChartById(chartId);

    if (!result.success) {
      return res.status(404).send('Chart not found');
    }

    res.render('chart-designer', {
      title: `${result.data.displayName} - Chart Designer`,
      currentPath: req.path,
      user: req.user || null,
      appId: result.data.applicationId,
      chart: result.data
    });
  } catch (error) {
    console.error('Failed to load chart designer:', error);
    res.status(404).send('Chart not found');
  }
});

/**
 * Dashboard designer page - Create new dashboard
 */
router.get('/dashboards/new', (req, res) => {
  const appId = req.query.appId || null;

  res.render('dashboard-designer', {
    title: 'Dashboard Designer - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId,
    dashboard: null
  });
});

/**
 * Dashboard designer page - Edit existing dashboard
 */
router.get('/dashboards/:dashboardId/designer', async (req, res) => {
  try {
    const { dashboardId } = req.params;

    // Load dashboard data
    const DashboardService = require('./services/DashboardService');
    const result = await DashboardService.getDashboardById(dashboardId);

    if (!result.success) {
      return res.status(404).send('Dashboard not found');
    }

    res.render('dashboard-designer', {
      title: `${result.data.displayName} - Dashboard Designer`,
      currentPath: req.path,
      user: req.user || null,
      appId: result.data.applicationId,
      dashboard: result.data
    });
  } catch (error) {
    console.error('Failed to load dashboard designer:', error);
    res.status(404).send('Dashboard not found');
  }
});

/**
 * Application Runner - Launch application
 * /lowcode/apps/:appId
 */
router.get('/apps/:appId', (req, res) => {
  const { appId } = req.params;

  res.render('app-runner', {
    title: 'Application - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId,
    formId: null
  });
});

/**
 * Application Runner - Specific form
 * /lowcode/apps/:appId/forms/:formId
 */
router.get('/apps/:appId/forms/:formId', (req, res) => {
  const { appId, formId } = req.params;

  res.render('app-runner', {
    title: 'Application - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId,
    formId
  });
});

/**
 * Settings Manager - Manage application settings and variables
 */
router.get('/settings', (req, res) => {
  const appId = req.query.appId;

  if (!appId) {
    return res.redirect('/lowcode/applications');
  }

  res.render('settings-manager', {
    title: 'Settings Manager',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Workflow Designer - Visual workflow builder
 * Integrates Exprsn Kicks for visual workflow creation
 */
router.get('/workflows/designer', (req, res) => {
  const appId = req.query.appId || null;
  const workflowId = req.query.workflowId || null;

  res.render('workflow-designer', {
    title: 'Workflow Designer - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId,
    workflowId
  });
});

/**
 * Workflows List - View all workflows for an application
 */
router.get('/workflows', (req, res) => {
  const appId = req.query.appId;

  if (!appId) {
    return res.redirect('/lowcode/applications');
  }

  res.render('workflows-list', {
    title: 'Workflows - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Decision Tables - Business rules management
 */
router.get('/decisions', (req, res) => {
  const appId = req.query.appId || null;

  res.render('decisions', {
    title: 'Decision Tables',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Plugins - Plugin and extension management
 */
router.get('/plugins', (req, res) => {
  const appId = req.query.appId || null;

  res.render('plugins', {
    title: 'Plugins & Extensions',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Plugin Creator - Visual wizard for creating plugins
 */
router.get('/plugins/create', (req, res) => {
  res.render('plugin-creator', {
    title: 'Create Plugin - Exprsn Low-Code',
    currentPath: req.path,
    user: req.user || null
  });
});

/**
 * Cards - Reusable component library
 */
router.get('/cards', (req, res) => {
  const appId = req.query.appId || null;

  res.render('cards', {
    title: 'Reusable Cards',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Polls - Polls and surveys management
 */
router.get('/polls', (req, res) => {
  const appId = req.query.appId || null;

  res.render('polls', {
    title: 'Polls & Surveys',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Data Sources - External data connections
 */
router.get('/datasources', (req, res) => {
  const appId = req.query.appId;

  if (!appId) {
    return res.redirect('/lowcode/applications');
  }

  // Fetch application name for display
  const db = require('./models');
  db.Application.findByPk(appId).then(app => {
    if (!app) {
      return res.redirect('/lowcode/applications');
    }

    res.render('datasources-manager', {
      title: `Data Sources - ${app.displayName}`,
      currentPath: req.path,
      user: req.user || null,
      appId: appId,
      appName: app.displayName
    });
  }).catch(err => {
    console.error('Failed to load application:', err);
    res.redirect('/lowcode/applications');
  });
});

/**
 * APIs - API endpoint builder
 */
router.get('/apis', (req, res) => {
  const appId = req.query.appId || null;

  res.render('apis', {
    title: 'APIs & Integrations',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * API Designer - Create new API
 */
router.get('/apis/new', (req, res) => {
  const appId = req.query.appId || null;

  res.render('api-designer', {
    title: 'New API Endpoint',
    currentPath: req.path,
    user: req.user || null,
    appId,
    api: null
  });
});

/**
 * API Designer - Edit existing API
 */
router.get('/apis/:apiId/designer', async (req, res) => {
  try {
    const { apiId } = req.params;

    // Load API data
    const ApiService = require('./services/ApiService');
    const api = await ApiService.getApiById(apiId);

    res.render('api-designer', {
      title: `${api.displayName} - API Designer`,
      currentPath: req.path,
      user: req.user || null,
      appId: api.applicationId,
      api
    });
  } catch (error) {
    console.error('Failed to load API designer:', error);
    res.status(404).send('API not found');
  }
});

/**
 * Security - RBAC and permissions management
 */
router.get('/security', (req, res) => {
  const appId = req.query.appId || null;

  res.render('security', {
    title: 'Security & Permissions',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Automation - Automation rules builder
 */
router.get('/automation', (req, res) => {
  const appId = req.query.appId || null;

  res.render('automation', {
    title: 'Automation Rules',
    currentPath: req.path,
    user: req.user || null,
    appId
  });
});

/**
 * Application Flow Designer - Visual user journey and navigation flow designer
 * Design application flows with screens, forms, grids, dashboards, and conditional routing
 */
router.get('/app-flow-designer', (req, res) => {
  const appId = req.query.appId || null;

  if (!appId) {
    return res.redirect('/lowcode/applications');
  }

  res.render('app-flow-designer', {
    title: 'Application Flow Designer',
    currentPath: req.path,
    user: req.user || null,
    appId,
    appName: 'Application' // TODO: Fetch from database
  });
});

/**
 * Git Diff Viewer - Compare database vs. Git file versions
 */
router.get('/git-diff', (req, res) => {
  res.render('git-diff', {
    title: 'Git Diff Viewer',
    currentPath: req.path,
    user: req.user || null
  });
});

// Mount report page routes
router.use('/', reportPagesRoutes);

// Mount API routes at /api
router.use('/api', apiRoutes);

// Mount custom API runtime at /custom
// This handles dynamic execution of user-created API endpoints
const apiRuntimeRoutes = require('./routes/apiRuntime');
router.use('/custom', apiRuntimeRoutes);

module.exports = router;
module.exports.configureLowCodeViews = configureLowCodeViews;
