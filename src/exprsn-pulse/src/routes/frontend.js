/**
 * Exprsn Pulse - Frontend Routes
 * Web UI routes for dashboards, reports, data sources, and visualizations
 */

const express = require('express');
const router = express.Router();
const { asyncHandler, requireRole } = require('@exprsn/shared');
const DashboardService = require('../services/DashboardService');
const ReportService = require('../services/ReportService');
const DataSourceService = require('../services/DataSourceService');
const VisualizationService = require('../services/VisualizationService');
const ScheduleService = require('../services/ScheduleService');
const ServiceIntegration = require('../services/ServiceIntegration');
const { Dashboard, Report, DataSource, Visualization, Schedule } = require('../models');

// Helper function to render with layout
const renderPage = (view, data = {}) => {
  return {
    ...data,
    currentYear: new Date().getFullYear()
  };
};

// ============================================================================
// HOME PAGE
// ============================================================================

router.get('/', asyncHandler(async (req, res) => {
  // Get statistics for home page dashboard
  const [
    dashboardCount,
    reportCount,
    dataSourceCount,
    vizCount,
    recentDashboards,
    recentReports
  ] = await Promise.all([
    Dashboard.count(),
    Report.count(),
    DataSource.count(),
    Visualization.count(),
    Dashboard.findAll({
      limit: 5,
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'name', 'description', 'updatedAt', 'isRealtime']
    }),
    Report.findAll({
      limit: 5,
      order: [['updatedAt', 'DESC']],
      attributes: ['id', 'name', 'description', 'updatedAt']
    })
  ]);

  res.render('index', renderPage('index', {
    title: 'Home - Exprsn Pulse',
    currentPage: 'home',
    stats: {
      dashboards: dashboardCount,
      reports: reportCount,
      dataSources: dataSourceCount,
      visualizations: vizCount
    },
    recentDashboards,
    recentReports,
    user: req.user || null
  }));
}));

// ============================================================================
// DASHBOARDS
// ============================================================================

// Dashboard browser
router.get('/dashboards', asyncHandler(async (req, res) => {
  const { filter, search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const where = {};
  if (search) {
    where.name = { [require('sequelize').Op.iLike]: `%${search}%` };
  }

  const { rows: dashboards, count } = await Dashboard.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['updatedAt', 'DESC']],
    include: [
      { model: require('../models').DashboardItem, as: 'items' }
    ]
  });

  res.render('dashboards/index', renderPage('dashboards/index', {
    title: 'Dashboards',
    currentPage: 'dashboards',
    dashboards,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    },
    filter,
    search,
    user: req.user || null
  }));
}));

// Dashboard viewer
router.get('/dashboards/:id', asyncHandler(async (req, res) => {
  const dashboard = await Dashboard.findByPk(req.params.id, {
    include: [
      {
        model: require('../models').DashboardItem,
        as: 'items',
        include: [
          { model: Visualization, as: 'visualization' }
        ]
      }
    ]
  });

  if (!dashboard) {
    return res.status(404).render('error', renderPage('error', {
      title: 'Dashboard Not Found',
      error: { message: 'Dashboard not found', status: 404 }
    }));
  }

  // Render dashboard with data
  const rendered = await DashboardService.render(req.params.id);

  res.render('dashboards/view', renderPage('dashboards/view', {
    title: `${dashboard.name} - Dashboard`,
    currentPage: 'dashboards',
    dashboard,
    renderedData: rendered,
    user: req.user || null
  }));
}));

// Dashboard builder
router.get('/dashboards/new', asyncHandler(async (req, res) => {
  // Get available visualizations for the toolbox
  const visualizations = await Visualization.findAll({
    order: [['name', 'ASC']],
    attributes: ['id', 'name', 'type', 'description']
  });

  res.render('dashboards/builder', renderPage('dashboards/builder', {
    title: 'Create Dashboard',
    currentPage: 'dashboards',
    visualizations,
    dashboard: null, // New dashboard
    user: req.user || null
  }));
}));

// Dashboard editor
router.get('/dashboards/:id/edit', asyncHandler(async (req, res) => {
  const dashboard = await Dashboard.findByPk(req.params.id, {
    include: [
      {
        model: require('../models').DashboardItem,
        as: 'items',
        include: [{ model: Visualization, as: 'visualization' }]
      }
    ]
  });

  if (!dashboard) {
    return res.status(404).render('error', renderPage('error', {
      title: 'Dashboard Not Found',
      error: { message: 'Dashboard not found', status: 404 }
    }));
  }

  const visualizations = await Visualization.findAll({
    order: [['name', 'ASC']],
    attributes: ['id', 'name', 'type', 'description']
  });

  res.render('dashboards/builder', renderPage('dashboards/builder', {
    title: `Edit ${dashboard.name}`,
    currentPage: 'dashboards',
    visualizations,
    dashboard,
    user: req.user || null
  }));
}));

// ============================================================================
// REPORTS
// ============================================================================

// Report browser
router.get('/reports', asyncHandler(async (req, res) => {
  const { filter, search, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  const where = {};
  if (search) {
    where.name = { [require('sequelize').Op.iLike]: `%${search}%` };
  }

  const { rows: reports, count } = await Report.findAndCountAll({
    where,
    limit: parseInt(limit),
    offset: parseInt(offset),
    order: [['updatedAt', 'DESC']],
    include: [
      { model: require('../models').ReportParameter, as: 'parameters' },
      { model: require('../models').Filter, as: 'filters' }
    ]
  });

  res.render('reports/index', renderPage('reports/index', {
    title: 'Reports',
    currentPage: 'reports',
    reports,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    },
    filter,
    search,
    user: req.user || null
  }));
}));

// Report execution page
router.get('/reports/:id/execute', asyncHandler(async (req, res) => {
  const report = await Report.findByPk(req.params.id, {
    include: [
      { model: require('../models').ReportParameter, as: 'parameters' },
      { model: require('../models').Filter, as: 'filters' }
    ]
  });

  if (!report) {
    return res.status(404).render('error', renderPage('error', {
      title: 'Report Not Found',
      error: { message: 'Report not found', status: 404 }
    }));
  }

  res.render('reports/execute', renderPage('reports/execute', {
    title: `Execute ${report.name}`,
    currentPage: 'reports',
    report,
    user: req.user || null
  }));
}));

// Report builder
router.get('/reports/new', asyncHandler(async (req, res) => {
  const visualizations = await Visualization.findAll({
    order: [['name', 'ASC']],
    attributes: ['id', 'name', 'type', 'description']
  });

  res.render('reports/builder', renderPage('reports/builder', {
    title: 'Create Report',
    currentPage: 'reports',
    visualizations,
    report: null,
    user: req.user || null
  }));
}));

// Report editor
router.get('/reports/:id/edit', asyncHandler(async (req, res) => {
  const report = await Report.findByPk(req.params.id, {
    include: [
      { model: require('../models').ReportParameter, as: 'parameters' },
      { model: require('../models').Filter, as: 'filters' }
    ]
  });

  if (!report) {
    return res.status(404).render('error', renderPage('error', {
      title: 'Report Not Found',
      error: { message: 'Report not found', status: 404 }
    }));
  }

  const visualizations = await Visualization.findAll({
    order: [['name', 'ASC']],
    attributes: ['id', 'name', 'type', 'description']
  });

  res.render('reports/builder', renderPage('reports/builder', {
    title: `Edit ${report.name}`,
    currentPage: 'reports',
    visualizations,
    report,
    user: req.user || null
  }));
}));

// ============================================================================
// DATA SOURCES
// ============================================================================

// Data source browser
router.get('/data/sources', asyncHandler(async (req, res) => {
  const dataSources = await DataSource.findAll({
    order: [['name', 'ASC']]
  });

  res.render('data/sources', renderPage('data/sources', {
    title: 'Data Sources',
    currentPage: 'data-sources',
    dataSources,
    user: req.user || null
  }));
}));

// Data source form (new)
router.get('/data/sources/new', asyncHandler(async (req, res) => {
  res.render('data/source-form', renderPage('data/source-form', {
    title: 'New Data Source',
    currentPage: 'data-sources',
    dataSource: null,
    user: req.user || null
  }));
}));

// Data source form (edit)
router.get('/data/sources/:id/edit', asyncHandler(async (req, res) => {
  const dataSource = await DataSource.findByPk(req.params.id);

  if (!dataSource) {
    return res.status(404).render('error', renderPage('error', {
      title: 'Data Source Not Found',
      error: { message: 'Data source not found', status: 404 }
    }));
  }

  res.render('data/source-form', renderPage('data/source-form', {
    title: `Edit ${dataSource.name}`,
    currentPage: 'data-sources',
    dataSource,
    user: req.user || null
  }));
}));

// ============================================================================
// QUERIES
// ============================================================================

// Query browser
router.get('/data/queries', asyncHandler(async (req, res) => {
  const queries = await require('../models').Query.findAll({
    include: [{ model: DataSource, as: 'dataSource' }],
    order: [['name', 'ASC']]
  });

  res.render('data/queries', renderPage('data/queries', {
    title: 'Queries',
    currentPage: 'queries',
    queries,
    user: req.user || null
  }));
}));

// Query builder
router.get('/data/queries/new', asyncHandler(async (req, res) => {
  const dataSources = await DataSource.findAll({
    order: [['name', 'ASC']],
    attributes: ['id', 'name', 'type']
  });

  res.render('data/query-builder', renderPage('data/query-builder', {
    title: 'Create Query',
    currentPage: 'queries',
    dataSources,
    query: null,
    user: req.user || null
  }));
}));

// ============================================================================
// VISUALIZATIONS
// ============================================================================

// Visualization browser
router.get('/visualizations', asyncHandler(async (req, res) => {
  const visualizations = await Visualization.findAll({
    include: [
      { model: require('../models').Dataset, as: 'dataset' }
    ],
    order: [['name', 'ASC']]
  });

  res.render('visualizations/index', renderPage('visualizations/index', {
    title: 'Visualizations',
    currentPage: 'visualizations',
    visualizations,
    user: req.user || null
  }));
}));

// Visualization designer
router.get('/visualizations/new', asyncHandler(async (req, res) => {
  const datasets = await require('../models').Dataset.findAll({
    order: [['name', 'ASC']],
    attributes: ['id', 'name', 'datasetType']
  });

  res.render('visualizations/designer', renderPage('visualizations/designer', {
    title: 'Create Visualization',
    currentPage: 'visualizations',
    datasets,
    visualization: null,
    user: req.user || null
  }));
}));

// ============================================================================
// SCHEDULES
// ============================================================================

// Schedule browser
router.get('/schedules', asyncHandler(async (req, res) => {
  const schedules = await Schedule.findAll({
    include: [{ model: Report, as: 'report' }],
    order: [['nextExecution', 'ASC']]
  });

  res.render('schedules/index', renderPage('schedules/index', {
    title: 'Schedules',
    currentPage: 'schedules',
    schedules,
    user: req.user || null
  }));
}));

// Schedule form
router.get('/schedules/new', asyncHandler(async (req, res) => {
  const reports = await Report.findAll({
    order: [['name', 'ASC']],
    attributes: ['id', 'name']
  });

  res.render('schedules/form', renderPage('schedules/form', {
    title: 'Create Schedule',
    currentPage: 'schedules',
    reports,
    schedule: null,
    user: req.user || null
  }));
}));

// ============================================================================
// ADMIN / SETTINGS
// ============================================================================

// Settings page - ADMIN ONLY
router.get('/settings', requireRole(['admin']), asyncHandler(async (req, res) => {
  res.render('settings/index', renderPage('settings/index', {
    title: 'Settings',
    currentPage: 'settings',
    user: req.user || null
  }));
}));

// ============================================================================
// DATASETS
// ============================================================================

// Dataset browser
router.get('/data/datasets', asyncHandler(async (req, res) => {
  const datasets = await require('../models').Dataset.findAll({
    order: [['name', 'ASC']]
  });

  res.render('data/datasets', renderPage('data/datasets', {
    title: 'Datasets',
    currentPage: 'datasets',
    datasets,
    user: req.user || null
  }));
}));

// ============================================================================
// VARIABLES & FUNCTIONS
// ============================================================================

// Variables browser
router.get('/data/variables', asyncHandler(async (req, res) => {
  // TODO: Implement Variable model
  const variables = [];

  res.render('data/variables', renderPage('data/variables', {
    title: 'Variables & Functions',
    currentPage: 'variables',
    variables,
    user: req.user || null
  }));
}));

// ============================================================================
// ADMIN - PERMISSIONS
// ============================================================================

// Permissions management - ADMIN ONLY
router.get('/admin/permissions', requireRole(['admin']), asyncHandler(async (req, res) => {
  // Load roles and permissions from exprsn-auth
  let roles = [];
  let permissions = [];

  try {
    const token = req.headers.authorization?.split(' ')[1];

    if (token) {
      [roles, permissions] = await Promise.all([
        ServiceIntegration.getAllRoles(token),
        ServiceIntegration.getAllPermissions(token)
      ]);
    }
  } catch (error) {
    // Fallback to empty arrays if auth service is unavailable
    console.warn('Failed to fetch roles/permissions from exprsn-auth:', error.message);
  }

  res.render('admin/permissions', renderPage('admin/permissions', {
    title: 'Permissions Management',
    currentPage: 'admin',
    roles,
    permissions,
    user: req.user || null
  }));
}));

// ============================================================================
// ADMIN - AUDIT LOGS
// ============================================================================

// Audit log viewer - ADMIN ONLY
router.get('/admin/audit', requireRole(['admin']), asyncHandler(async (req, res) => {
  const { page = 1, limit = 50, action, userId, resource } = req.query;
  const offset = (page - 1) * limit;

  // TODO: Implement AuditLog model
  const logs = [];
  const count = 0;

  res.render('admin/audit', renderPage('admin/audit', {
    title: 'Audit Logs',
    currentPage: 'admin',
    logs,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: count,
      pages: Math.ceil(count / limit)
    },
    filters: { action, userId, resource },
    user: req.user || null
  }));
}));

// ============================================================================
// ERROR PAGES
// ============================================================================

// 404 page
router.use((req, res) => {
  res.status(404).render('error', renderPage('error', {
    title: 'Page Not Found',
    error: {
      message: 'The page you are looking for does not exist',
      status: 404
    }
  }));
});

module.exports = router;
