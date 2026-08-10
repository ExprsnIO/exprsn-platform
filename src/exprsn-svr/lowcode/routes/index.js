/**
 * Low-Code Routes Index
 *
 * Consolidates all low-code API routes.
 * Base path: /lowcode/api
 */

const express = require('express');
const router = express.Router();
const { caTokenAuth, optionalAuth } = require('../middleware/caTokenAuth');

// Health check endpoint (no auth required)
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'low-code-platform',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    status: 'healthy',
    authentication: process.env.NODE_ENV === 'development' && process.env.LOW_CODE_DEV_AUTH === 'true'
      ? 'development-bypass'
      : 'ca-token-required'
  });
});

// API info endpoint (no auth required)
router.get('/', (req, res) => {
  res.json({
    success: true,
    name: 'Exprsn Low-Code Platform API',
    version: '1.0.0',
    description: 'RESTful API for low-code application development',
    endpoints: {
      applications: '/lowcode/api/applications',
      entities: '/lowcode/api/entities',
      forms: '/lowcode/api/forms',
      grids: '/lowcode/api/grids',
      cards: '/lowcode/api/cards',
      dataSources: '/lowcode/api/datasources',
      polls: '/lowcode/api/polls',
      runtime: '/lowcode/api/runtime',
      formulas: '/lowcode/api/formulas',
      settings: '/lowcode/api/settings',
      processes: '/lowcode/api/processes',
      automation: '/lowcode/api/automation',
      charts: '/lowcode/api/charts',
      dashboards: '/lowcode/api/dashboards',
      reports: '/lowcode/api/reports',
      apis: '/lowcode/api/apis',
      ai: '/lowcode/api/ai',
      security: '/lowcode/api/security',
      tiles: '/lowcode/api/tiles',
      htmlProjects: '/lowcode/api/html-projects',
      htmlFiles: '/lowcode/api/html-files',
      htmlComponents: '/lowcode/api/html-components',
      htmlLibraries: '/lowcode/api/html-libraries',
      dataQuery: '/lowcode/api/data/query',
      dataRedis: '/lowcode/api/data/redis',
      dataXML: '/lowcode/api/data/xml',
      dataJSON: '/lowcode/api/data/json',
      dataConnections: '/lowcode/api/data/connections',
      queryExecutor: '/lowcode/api/query/execute',
      queryValidate: '/lowcode/api/query/validate',
      queryPreview: '/lowcode/api/query/preview',
      git: '/lowcode/api/git',
      artifacts: '/lowcode/api/artifacts',
      plugins: '/lowcode/api/plugins'
    },
    documentation: 'See /lowcode/README.md for complete documentation',
  });
});

// Apply CA token authentication to all routes below this point
// For development: Set LOW_CODE_DEV_AUTH=true to enable bypass
router.use(caTokenAuth);

// Import route modules
const applicationsRouter = require('./applications');
const entitiesRouter = require('./entities');
const formsRouter = require('./forms');
const gridsRouter = require('./grids');
const cardsRouter = require('./cards');
const dataSourcesRouter = require('./dataSources');
const pollsRouter = require('./polls');
const runtimeRouter = require('./runtime');
const formulasRouter = require('./formulas');
const settingsRouter = require('./settings');
const processesRouter = require('./processes');
const automationRouter = require('./automation');
const chartsRouter = require('./charts');
const dashboardsRouter = require('./dashboards');
const reportsRouter = require('./reports');
const apisRouter = require('./apis');
const aiRouter = require('./ai');
const securityRouter = require('./security');
const tilesRouter = require('./tiles');
const htmlRouter = require('./htmlIndex');
const dataAccessRouter = require('./dataAccess');
const queriesRouter = require('./queries');
const datasourcesIntrospectionRouter = require('./datasources');
const artifactsRouter = require('./artifacts');

console.log('[LowCode Routes] Loading queryExecutor module...');
const queryExecutorRouter = require('./queryExecutor');
console.log('[LowCode Routes] queryExecutor loaded successfully');

// Mount protected routers
router.use('/applications', applicationsRouter);
router.use('/entities', entitiesRouter);
router.use('/forms', formsRouter);
router.use('/grids', gridsRouter);
router.use('/cards', cardsRouter);
router.use('/datasources', dataSourcesRouter);
router.use('/polls', pollsRouter);
router.use('/runtime', runtimeRouter);
router.use('/formulas', formulasRouter);
router.use('/settings', settingsRouter);
router.use('/processes', processesRouter);
router.use('/automation', automationRouter);
router.use('/charts', chartsRouter);
router.use('/dashboards', dashboardsRouter);
router.use('/reports', reportsRouter);
router.use('/apis', apisRouter);
router.use('/ai', aiRouter);
router.use('/security', securityRouter);
router.use('/tiles', tilesRouter);
router.use('/queries', queriesRouter);
router.use('/datasource-introspection', datasourcesIntrospectionRouter);

// Mount Data Access routes
router.use('/data', dataAccessRouter);

// Mount Query Executor routes
router.use('/query', queryExecutorRouter);

// Mount HTML App Builder routes
router.use('/', htmlRouter);

// Mount Application-HTML Integration routes
const appHtmlIntegrationRouter = require('./appHtmlIntegration');
router.use('/', appHtmlIntegrationRouter);

// Mount Function Builder routes
const functionBuilderRouter = require('./functionBuilder');
router.use('/', functionBuilderRouter);

// Mount Git Integration routes
const gitRouter = require('./git');
router.use('/git', gitRouter);

// Mount Artifact Export/Import routes
router.use('/artifacts', artifactsRouter);

// Mount Plugin Management routes
const pluginsRouter = require('./plugins');
router.use('/plugins', pluginsRouter);

module.exports = router;
