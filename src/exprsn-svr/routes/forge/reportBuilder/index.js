/**
 * Report Builder API Routes
 * Provides endpoints for report builder functionality
 */

const express = require('express');
const router = express.Router();
const Joi = require('joi');
const { requirePermission } = require('../../../middleware/auth');
const crmReportService = require('../../../services/forge/crm/reportService');
const erpReportService = require('../../../services/forge/erp/reportBuilderService');
const groupwareReportService = require('../../../services/forge/groupware/reportService');
const reportVariableService = require('../../../services/forge/shared/reportVariableService');
const reportQueryBuilder = require('../../../services/forge/shared/reportQueryBuilder');
const reportTemplateService = require('../../../services/forge/shared/reportTemplateService');
const reportWorkflowIntegration = require('../../../services/forge/shared/reportWorkflowIntegration');
const reportChartService = require('../../../services/forge/shared/reportChartService');
const reportFormattingService = require('../../../services/forge/shared/reportFormattingService');
const reportSubscriptionService = require('../../../services/forge/shared/reportSubscriptionService');
const logger = require('../../../utils/logger');

// ===== Report Types and Discovery =====

/**
 * GET /api/report-builder/types
 * Get all available report types
 */
router.get('/types',  async (req, res) => {
  try {
    const reportTypes = {
      crm: crmReportService.getAvailableReports(),
      erp: erpReportService.getAvailableReports(),
      groupware: groupwareReportService.getAvailableReports()
    };

    res.json({
      success: true,
      data: reportTypes
    });
  } catch (err) {
    logger.error('Failed to get report types', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/report-builder/types/:module
 * Get available report types for a specific module
 */
router.get('/types/:module',  async (req, res) => {
  try {
    const { module } = req.params;

    let reports;
    switch (module) {
      case 'crm':
        reports = crmReportService.getAvailableReports();
        break;
      case 'erp':
        reports = erpReportService.getAvailableReports();
        break;
      case 'groupware':
        reports = groupwareReportService.getAvailableReports();
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'INVALID_MODULE',
          message: 'Invalid module. Must be crm, erp, or groupware'
        });
    }

    res.json({
      success: true,
      data: reports
    });
  } catch (err) {
    logger.error('Failed to get report types for module', { error: err.message, module: req.params.module });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

// ===== Report Generation =====

const generateReportSchema = Joi.object({
  module: Joi.string().valid('crm', 'erp', 'groupware').required(),
  reportType: Joi.string().required(),
  parameters: Joi.object().default({}),
  context: Joi.object().default({})
});

/**
 * POST /api/report-builder/generate
 * Generate a report from report builder
 */
router.post('/generate',  requirePermission('read'), async (req, res) => {
  try {
    const { error, value } = generateReportSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { module, reportType, parameters, context } = value;

    // Add user context
    const fullContext = {
      ...context,
      userId: req.user.id,
      userDepartment: req.user.department
    };

    let result;
    switch (module) {
      case 'crm':
        result = await crmReportService.generateReport(reportType, parameters, fullContext);
        break;
      case 'erp':
        result = await erpReportService.generateReport(reportType, parameters, fullContext);
        break;
      case 'groupware':
        result = await groupwareReportService.generateReport(reportType, parameters, fullContext);
        break;
      default:
        return res.status(400).json({
          success: false,
          error: 'INVALID_MODULE'
        });
    }

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    logger.error('Failed to generate report', { error: err.message, body: req.body });
    res.status(500).json({
      success: false,
      error: 'REPORT_GENERATION_FAILED',
      message: err.message
    });
  }
});

// ===== Variable Management =====

/**
 * GET /api/report-builder/variables/types
 * Get all variable types
 */
router.get('/variables/types',  async (req, res) => {
  try {
    res.json({
      success: true,
      data: reportVariableService.variableTypes
    });
  } catch (err) {
    logger.error('Failed to get variable types', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/report-builder/variables/dynamic
 * Get all available dynamic variables with current values
 */
router.get('/variables/dynamic',  async (req, res) => {
  try {
    const context = {
      userId: req.user.id,
      userDepartment: req.user.department
    };

    const dynamicVariables = reportVariableService.getAvailableDynamicVariables(context);

    res.json({
      success: true,
      data: dynamicVariables
    });
  } catch (err) {
    logger.error('Failed to get dynamic variables', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

const defineVariableSchema = Joi.object({
  name: Joi.string().required(),
  label: Joi.string().required(),
  type: Joi.string().required(),
  description: Joi.string().allow(''),
  defaultValue: Joi.any(),
  required: Joi.boolean().default(true),
  options: Joi.array().items(Joi.object({
    label: Joi.string().required(),
    value: Joi.any().required()
  })),
  min: Joi.alternatives().try(Joi.number(), Joi.date()),
  max: Joi.alternatives().try(Joi.number(), Joi.date()),
  format: Joi.string(),
  placeholder: Joi.string(),
  dynamicRef: Joi.string(),
  dependsOn: Joi.string(),
  order: Joi.number().default(0),
  category: Joi.string().default('general')
});

/**
 * POST /api/report-builder/variables/define
 * Define a new variable
 */
router.post('/variables/define',  async (req, res) => {
  try {
    const { error, value } = defineVariableSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const variable = reportVariableService.defineVariable(value);

    res.json({
      success: true,
      data: variable
    });
  } catch (err) {
    logger.error('Failed to define variable', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

const resolveVariablesSchema = Joi.object({
  variables: Joi.object().required(),
  userValues: Joi.object().default({}),
  context: Joi.object().default({})
});

/**
 * POST /api/report-builder/variables/resolve
 * Resolve variable values
 */
router.post('/variables/resolve',  async (req, res) => {
  try {
    const { error, value } = resolveVariablesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const context = {
      ...value.context,
      userId: req.user.id,
      userDepartment: req.user.department
    };

    const resolved = reportVariableService.resolveVariables(value.variables, value.userValues, context);

    res.json({
      success: true,
      data: resolved
    });
  } catch (err) {
    logger.error('Failed to resolve variables', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'VARIABLE_RESOLUTION_FAILED',
      message: err.message
    });
  }
});

const validateVariablesSchema = Joi.object({
  variables: Joi.object().required(),
  values: Joi.object().required()
});

/**
 * POST /api/report-builder/variables/validate
 * Validate variable values
 */
router.post('/variables/validate',  async (req, res) => {
  try {
    const { error, value } = validateVariablesSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const validation = reportVariableService.validateVariables(value.variables, value.values);

    res.json({
      success: true,
      data: validation
    });
  } catch (err) {
    logger.error('Failed to validate variables', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

// ===== Query Builder =====

const buildQuerySchema = Joi.object({
  filters: Joi.alternatives().try(Joi.object(), Joi.array()),
  sorting: Joi.alternatives().try(Joi.object(), Joi.array(), Joi.string()),
  pagination: Joi.object({
    limit: Joi.number().min(1).max(10000),
    offset: Joi.number().min(0),
    page: Joi.number().min(1),
    pageSize: Joi.number().min(1).max(1000)
  }),
  groupBy: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string())),
  having: Joi.object(),
  attributes: Joi.alternatives().try(Joi.array(), Joi.object()),
  includes: Joi.array().items(Joi.object()),
  distinct: Joi.alternatives().try(Joi.boolean(), Joi.string())
});

/**
 * POST /api/report-builder/query/build
 * Build a query from configuration
 */
router.post('/query/build',  async (req, res) => {
  try {
    const { error, value } = buildQuerySchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const query = reportQueryBuilder.buildQuery(value);

    res.json({
      success: true,
      data: query
    });
  } catch (err) {
    logger.error('Failed to build query', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'QUERY_BUILD_FAILED',
      message: err.message
    });
  }
});

/**
 * POST /api/report-builder/query/validate
 * Validate a query configuration
 */
router.post('/query/validate',  async (req, res) => {
  try {
    const validation = reportQueryBuilder.validateQuery(req.body);

    res.json({
      success: true,
      data: validation
    });
  } catch (err) {
    logger.error('Failed to validate query', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/report-builder/query/describe
 * Get human-readable description of query
 */
router.post('/query/describe',  async (req, res) => {
  try {
    const description = reportQueryBuilder.describeQuery(req.body);

    res.json({
      success: true,
      data: { description }
    });
  } catch (err) {
    logger.error('Failed to describe query', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

// ===== Template Management =====

/**
 * GET /api/report-builder/templates
 * Get all available templates
 */
router.get('/templates',  async (req, res) => {
  try {
    const { category, module, isBuiltIn } = req.query;

    const filters = {
      category,
      module,
      isBuiltIn: isBuiltIn !== undefined ? isBuiltIn === 'true' : undefined,
      userId: req.user.id
    };

    const templates = reportTemplateService.getAvailableTemplates(filters);

    res.json({
      success: true,
      data: templates,
      count: templates.length
    });
  } catch (err) {
    logger.error('Failed to get templates', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/report-builder/templates/:id
 * Get template by ID
 */
router.get('/templates/:id',  async (req, res) => {
  try {
    const template = reportTemplateService.getTemplate(req.params.id);

    res.json({
      success: true,
      data: template
    });
  } catch (err) {
    logger.error('Failed to get template', { error: err.message, templateId: req.params.id });
    res.status(404).json({
      success: false,
      error: 'TEMPLATE_NOT_FOUND',
      message: err.message
    });
  }
});

const createTemplateSchema = Joi.object({
  name: Joi.string().required(),
  description: Joi.string().allow(''),
  category: Joi.string().required(),
  module: Joi.string().valid('crm', 'erp', 'groupware', 'custom').required(),
  reportType: Joi.string().required(),
  config: Joi.object().default({}),
  variables: Joi.object().default({}),
  tags: Joi.array().items(Joi.string()).default([]),
  sharedWith: Joi.array().items(Joi.string()).default([])
});

/**
 * POST /api/report-builder/templates
 * Create a new template
 */
router.post('/templates',  requirePermission('write'), async (req, res) => {
  try {
    const { error, value } = createTemplateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const template = await reportTemplateService.createTemplate(value, req.user.id);

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (err) {
    logger.error('Failed to create template', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'TEMPLATE_CREATION_FAILED',
      message: err.message
    });
  }
});

const updateTemplateSchema = Joi.object({
  name: Joi.string(),
  description: Joi.string().allow(''),
  config: Joi.object(),
  variables: Joi.object(),
  tags: Joi.array().items(Joi.string()),
  sharedWith: Joi.array().items(Joi.string())
}).min(1);

/**
 * PUT /api/report-builder/templates/:id
 * Update a template
 */
router.put('/templates/:id',  requirePermission('write'), async (req, res) => {
  try {
    const { error, value } = updateTemplateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const template = await reportTemplateService.updateTemplate(req.params.id, value, req.user.id);

    res.json({
      success: true,
      data: template
    });
  } catch (err) {
    logger.error('Failed to update template', { error: err.message, templateId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'TEMPLATE_UPDATE_FAILED',
      message: err.message
    });
  }
});

/**
 * DELETE /api/report-builder/templates/:id
 * Delete a template
 */
router.delete('/templates/:id',  requirePermission('delete'), async (req, res) => {
  try {
    await reportTemplateService.deleteTemplate(req.params.id, req.user.id);

    res.json({
      success: true,
      message: 'Template deleted successfully'
    });
  } catch (err) {
    logger.error('Failed to delete template', { error: err.message, templateId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'TEMPLATE_DELETION_FAILED',
      message: err.message
    });
  }
});

const cloneTemplateSchema = Joi.object({
  name: Joi.string(),
  description: Joi.string()
});

/**
 * POST /api/report-builder/templates/:id/clone
 * Clone a template
 */
router.post('/templates/:id/clone',  requirePermission('write'), async (req, res) => {
  try {
    const { error, value } = cloneTemplateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const template = await reportTemplateService.cloneTemplate(req.params.id, req.user.id, value);

    res.status(201).json({
      success: true,
      data: template
    });
  } catch (err) {
    logger.error('Failed to clone template', { error: err.message, templateId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'TEMPLATE_CLONE_FAILED',
      message: err.message
    });
  }
});

const applyTemplateSchema = Joi.object({
  parameters: Joi.object().default({}),
  context: Joi.object().default({})
});

/**
 * POST /api/report-builder/templates/:id/apply
 * Apply template to create report instance
 */
router.post('/templates/:id/apply',  requirePermission('read'), async (req, res) => {
  try {
    const { error, value } = applyTemplateSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const context = {
      ...value.context,
      userId: req.user.id,
      userDepartment: req.user.department
    };

    const reportConfig = await reportTemplateService.applyTemplate(req.params.id, value.parameters, context);

    res.json({
      success: true,
      data: reportConfig
    });
  } catch (err) {
    logger.error('Failed to apply template', { error: err.message, templateId: req.params.id });
    res.status(500).json({
      success: false,
      error: 'TEMPLATE_APPLY_FAILED',
      message: err.message
    });
  }
});

/**
 * GET /api/report-builder/templates/by-category
 * Get templates grouped by category
 */
router.get('/templates/by-category',  async (req, res) => {
  try {
    const templates = reportTemplateService.getTemplatesByCategory();

    res.json({
      success: true,
      data: templates
    });
  } catch (err) {
    logger.error('Failed to get templates by category', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/report-builder/templates/search
 * Search templates
 */
router.get('/templates/search',  async (req, res) => {
  try {
    const { q, category, module } = req.query;

    if (!q) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Search query (q) is required'
      });
    }

    const templates = reportTemplateService.searchTemplates(q, { category, module });

    res.json({
      success: true,
      data: templates,
      count: templates.length
    });
  } catch (err) {
    logger.error('Failed to search templates', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

// ===== Workflow Integration =====

/**
 * GET /api/report-builder/workflow/steps
 * Get available workflow step types for reports
 */
router.get('/workflow/steps',  async (req, res) => {
  try {
    res.json({
      success: true,
      data: Object.values(reportWorkflowIntegration.workflowStepTypes)
    });
  } catch (err) {
    logger.error('Failed to get workflow steps', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/report-builder/workflow/register
 * Register report steps with workflow service
 */
router.post('/workflow/register',  requirePermission('admin'), async (req, res) => {
  try {
    const result = await reportWorkflowIntegration.registerReportSteps();

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    logger.error('Failed to register workflow steps', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'WORKFLOW_REGISTRATION_FAILED',
      message: err.message
    });
  }
});

/**
 * GET /api/report-builder/workflow/report-types
 * Get available report types for workflow configuration
 */
router.get('/workflow/report-types',  async (req, res) => {
  try {
    const reportTypes = reportWorkflowIntegration.getAvailableReportTypes();

    res.json({
      success: true,
      data: reportTypes
    });
  } catch (err) {
    logger.error('Failed to get workflow report types', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

// ===== Chart & Visualization Routes =====

/**
 * GET /api/report-builder/charts/types
 * Get all available chart types with metadata
 */
router.get('/charts/types',  async (req, res) => {
  try {
    const chartTypes = reportChartService.listChartTypes();

    res.json({
      success: true,
      data: chartTypes
    });
  } catch (err) {
    logger.error('Failed to get chart types', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/report-builder/charts/generate
 * Generate chart configuration from data
 */
const generateChartSchema = Joi.object({
  chartType: Joi.string().required(),
  data: Joi.array().required(),
  options: Joi.object().default({})
});

router.post('/charts/generate',  async (req, res) => {
  try {
    const { error, value } = generateChartSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { chartType, data, options } = value;

    const chartConfig = reportChartService.createChartConfig(chartType, data, options);

    res.json({
      success: true,
      data: chartConfig
    });
  } catch (err) {
    logger.error('Failed to generate chart', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'CHART_GENERATION_FAILED',
      message: err.message
    });
  }
});

/**
 * POST /api/report-builder/reports/:reportId/chart
 * Generate chart for a specific report
 */
router.post('/reports/:reportId/chart',  requirePermission('read'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { chartType, options } = req.body;

    // Get report service based on report type
    const reportService = require('../../../services/forge/shared/reportService');
    const report = await reportService.getReport(reportId, req.user.id);

    // Execute report to get data
    const execution = await reportService.executeReport(reportId, req.user.id, options?.parameters || {});

    // Generate chart from report data
    const chartConfig = reportChartService.generateChartFromReport(
      report,
      execution.result.data || [],
      { chartType, ...options }
    );

    res.json({
      success: true,
      data: chartConfig
    });
  } catch (err) {
    logger.error('Failed to generate report chart', {
      reportId: req.params.reportId,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'CHART_GENERATION_FAILED',
      message: err.message
    });
  }
});

/**
 * PUT /api/report-builder/reports/:reportId/chart
 * Save chart configuration to report
 */
const saveChartSchema = Joi.object({
  chartType: Joi.string().required(),
  config: Joi.object().required()
});

router.put('/reports/:reportId/chart',  requirePermission('write'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { error, value } = saveChartSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const reportService = require('../../../services/forge/shared/reportService');
    const report = await reportService.getReport(reportId, req.user.id);

    // Save chart configuration
    const updatedReport = await reportChartService.saveChartConfig(report, value);

    res.json({
      success: true,
      data: {
        reportId: updatedReport.id,
        visualization: updatedReport.visualization
      }
    });
  } catch (err) {
    logger.error('Failed to save chart config', {
      reportId: req.params.reportId,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'CHART_SAVE_FAILED',
      message: err.message
    });
  }
});

/**
 * GET /api/report-builder/reports/:reportId/chart
 * Get chart configuration for a report
 */
router.get('/reports/:reportId/chart',  requirePermission('read'), async (req, res) => {
  try {
    const { reportId } = req.params;

    const reportService = require('../../../services/forge/shared/reportService');
    const report = await reportService.getReport(reportId, req.user.id);

    res.json({
      success: true,
      data: report.visualization || null
    });
  } catch (err) {
    logger.error('Failed to get chart config', {
      reportId: req.params.reportId,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

// ===== Conditional Formatting Routes =====

/**
 * GET /api/report-builder/formatting/options
 * Get available formatting options (rule types, operators, etc.)
 */
router.get('/formatting/options',  async (req, res) => {
  try {
    const options = reportFormattingService.getFormattingOptions();

    res.json({
      success: true,
      data: options
    });
  } catch (err) {
    logger.error('Failed to get formatting options', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * POST /api/report-builder/formatting/apply
 * Apply formatting rules to report data
 */
const applyFormattingSchema = Joi.object({
  data: Joi.array().required(),
  rules: Joi.array().required(),
  options: Joi.object().default({})
});

router.post('/formatting/apply',  async (req, res) => {
  try {
    const { error, value } = applyFormattingSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const { data, rules, options } = value;

    const formattedData = reportFormattingService.applyFormatting(data, rules, options);

    res.json({
      success: true,
      data: formattedData
    });
  } catch (err) {
    logger.error('Failed to apply formatting', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'FORMATTING_FAILED',
      message: err.message
    });
  }
});

/**
 * POST /api/report-builder/formatting/rules
 * Create a new formatting rule
 */
const createRuleSchema = Joi.object({
  name: Joi.string().required(),
  type: Joi.string().required(),
  field: Joi.string().allow(null),
  condition: Joi.object().required(),
  formatting: Joi.object().required(),
  scope: Joi.string().valid('cell', 'row', 'column').default('cell'),
  priority: Joi.number().default(0),
  enabled: Joi.boolean().default(true)
});

router.post('/formatting/rules',  async (req, res) => {
  try {
    const { error, value } = createRuleSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const rule = reportFormattingService.createRule(value);

    res.json({
      success: true,
      data: rule
    });
  } catch (err) {
    logger.error('Failed to create formatting rule', { error: err.message });
    res.status(500).json({
      success: false,
      error: 'RULE_CREATION_FAILED',
      message: err.message
    });
  }
});

/**
 * PUT /api/report-builder/reports/:reportId/formatting
 * Save formatting rules to report
 */
const saveFormattingSchema = Joi.object({
  rules: Joi.array().required()
});

router.put('/reports/:reportId/formatting',  requirePermission('write'), async (req, res) => {
  try {
    const { reportId } = req.params;
    const { error, value } = saveFormattingSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const reportService = require('../../../services/forge/shared/reportService');
    const report = await reportService.getReport(reportId, req.user.id);

    // Save formatting rules to report config
    report.config = {
      ...report.config,
      formatting: value.rules
    };

    await report.save();

    res.json({
      success: true,
      data: {
        reportId: report.id,
        formattingRules: value.rules
      }
    });
  } catch (err) {
    logger.error('Failed to save formatting rules', {
      reportId: req.params.reportId,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'SAVE_FAILED',
      message: err.message
    });
  }
});

/**
 * GET /api/report-builder/reports/:reportId/formatting
 * Get formatting rules for a report
 */
router.get('/reports/:reportId/formatting',  requirePermission('read'), async (req, res) => {
  try {
    const { reportId } = req.params;

    const reportService = require('../../../services/forge/shared/reportService');
    const report = await reportService.getReport(reportId, req.user.id);

    res.json({
      success: true,
      data: report.config?.formatting || []
    });
  } catch (err) {
    logger.error('Failed to get formatting rules', {
      reportId: req.params.reportId,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

// ===== Report Subscription Routes =====

/**
 * POST /api/report-builder/subscriptions
 * Subscribe to a report for scheduled delivery
 */
const subscribeSchema = Joi.object({
  reportId: Joi.string().required(),
  name: Joi.string().required(),
  frequency: Joi.string().valid('once', 'daily', 'weekly', 'monthly', 'quarterly', 'yearly').required(),
  deliveryMethod: Joi.string().valid('email', 'storage', 'webhook').default('email'),
  exportFormat: Joi.string().valid('pdf', 'excel', 'csv', 'json').default('pdf'),
  recipients: Joi.array().items(Joi.string()).default([]),
  parameters: Joi.object().default({}),
  timezone: Joi.string().default('UTC'),
  runAt: Joi.string().default('09:00:00'),
  dayOfWeek: Joi.number().min(0).max(6),
  dayOfMonth: Joi.number().min(1).max(31),
  startDate: Joi.date().allow(null),
  endDate: Joi.date().allow(null),
  conditions: Joi.array().allow(null),
  digestMode: Joi.boolean().default(false),
  customMessage: Joi.string().allow(null)
});

router.post('/subscriptions',  requirePermission('read'), async (req, res) => {
  try {
    const { error, value } = subscribeSchema.validate(req.body);
    if (error) {
      return res.status(400).json({
        success: false,
        error: 'VALIDATION_ERROR',
        message: error.details[0].message
      });
    }

    const subscription = await reportSubscriptionService.subscribeToReport(
      req.user.id,
      value
    );

    res.status(201).json({
      success: true,
      data: subscription
    });
  } catch (err) {
    logger.error('Failed to create subscription', {
      userId: req.user.id,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'SUBSCRIPTION_FAILED',
      message: err.message
    });
  }
});

/**
 * GET /api/report-builder/subscriptions
 * Get user's report subscriptions
 */
router.get('/subscriptions',  async (req, res) => {
  try {
    const { isActive, reportId, page = 1, limit = 20 } = req.query;

    const result = await reportSubscriptionService.getUserSubscriptions(
      req.user.id,
      {
        isActive: isActive !== undefined ? isActive === 'true' : null,
        reportId,
        page: parseInt(page),
        limit: parseInt(limit)
      }
    );

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    logger.error('Failed to get subscriptions', {
      userId: req.user.id,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * GET /api/report-builder/subscriptions/:subscriptionId
 * Get subscription details
 */
router.get('/subscriptions/:subscriptionId',  async (req, res) => {
  try {
    const { ReportSchedule } = require('../../../models/forge');
    const subscription = await ReportSchedule.findOne({
      where: { id: req.params.subscriptionId },
      include: ['report']
    });

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        message: 'Subscription not found'
      });
    }

    // Check access
    if (subscription.createdBy !== req.user.id && !subscription.recipients.includes(req.user.id)) {
      return res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Access denied'
      });
    }

    res.json({
      success: true,
      data: subscription
    });
  } catch (err) {
    logger.error('Failed to get subscription', {
      subscriptionId: req.params.subscriptionId,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'INTERNAL_ERROR',
      message: err.message
    });
  }
});

/**
 * PUT /api/report-builder/subscriptions/:subscriptionId
 * Update subscription settings
 */
router.put('/subscriptions/:subscriptionId',  async (req, res) => {
  try {
    const subscription = await reportSubscriptionService.updateSubscription(
      req.params.subscriptionId,
      req.user.id,
      req.body
    );

    res.json({
      success: true,
      data: subscription
    });
  } catch (err) {
    logger.error('Failed to update subscription', {
      subscriptionId: req.params.subscriptionId,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'UPDATE_FAILED',
      message: err.message
    });
  }
});

/**
 * DELETE /api/report-builder/subscriptions/:subscriptionId
 * Unsubscribe from report
 */
router.delete('/subscriptions/:subscriptionId',  async (req, res) => {
  try {
    await reportSubscriptionService.unsubscribeFromReport(
      req.params.subscriptionId,
      req.user.id
    );

    res.json({
      success: true,
      message: 'Successfully unsubscribed'
    });
  } catch (err) {
    logger.error('Failed to unsubscribe', {
      subscriptionId: req.params.subscriptionId,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'UNSUBSCRIBE_FAILED',
      message: err.message
    });
  }
});

/**
 * POST /api/report-builder/subscriptions/:subscriptionId/execute
 * Manually execute a subscription
 */
router.post('/subscriptions/:subscriptionId/execute',  requirePermission('execute'), async (req, res) => {
  try {
    const result = await reportSubscriptionService.executeSubscription(
      req.params.subscriptionId
    );

    res.json({
      success: true,
      data: result
    });
  } catch (err) {
    logger.error('Failed to execute subscription', {
      subscriptionId: req.params.subscriptionId,
      error: err.message
    });
    res.status(500).json({
      success: false,
      error: 'EXECUTION_FAILED',
      message: err.message
    });
  }
});

module.exports = router;
