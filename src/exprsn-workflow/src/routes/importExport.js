const express = require('express');
const router = express.Router();
const importExportService = require('../services/importExportService');
const { validateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const Joi = require('joi');

/**
 * Validation schema for export options
 */
const exportOptionsSchema = Joi.object({
  includeMetadata: Joi.boolean().default(true),
  includeStatistics: Joi.boolean().default(false)
});

/**
 * Validation schema for import options
 */
const importOptionsSchema = Joi.object({
  conflictResolution: Joi.string().valid('rename', 'replace', 'skip').default('rename'),
  preserveIds: Joi.boolean().default(false),
  status: Joi.string().valid('draft', 'active', 'inactive').default('draft')
});

/**
 * Validation schema for bulk export
 */
const bulkExportSchema = Joi.object({
  workflowIds: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
  options: exportOptionsSchema.optional()
});

/**
 * @route   POST /api/workflows/:workflowId/export
 * @desc    Export a single workflow to JSON
 * @access  Private
 */
router.post('/:workflowId/export', validateToken, async (req, res) => {
  try {
    const { error, value } = exportOptionsSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const exportData = await importExportService.exportWorkflow(
      req.params.workflowId,
      value
    );

    logger.info('Workflow exported', {
      workflowId: req.params.workflowId,
      userId: req.user.id,
      includeMetadata: value.includeMetadata,
      includeStatistics: value.includeStatistics
    });

    // Set filename header for download
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="workflow-${req.params.workflowId}-${Date.now()}.json"`
    );
    res.setHeader('Content-Type', 'application/json');

    res.json({
      success: true,
      data: exportData,
      message: 'Workflow exported successfully'
    });
  } catch (error) {
    logger.error('Failed to export workflow', {
      error: error.message,
      workflowId: req.params.workflowId,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/workflows/export
 * @desc    Export multiple workflows to JSON
 * @access  Private
 */
router.post('/export', validateToken, async (req, res) => {
  try {
    const { error, value } = bulkExportSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const exportData = await importExportService.exportWorkflows(
      value.workflowIds,
      value.options || {}
    );

    logger.info('Multiple workflows exported', {
      count: value.workflowIds.length,
      userId: req.user.id
    });

    // Set filename header for download
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="workflows-bulk-export-${Date.now()}.json"`
    );
    res.setHeader('Content-Type', 'application/json');

    res.json({
      success: true,
      data: exportData,
      message: `${exportData.count} workflows exported successfully`
    });
  } catch (error) {
    logger.error('Failed to export workflows', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/workflows/import
 * @desc    Import a single workflow from JSON
 * @access  Private
 */
router.post('/import', validateToken, async (req, res) => {
  try {
    const { importData, options } = req.body;

    if (!importData) {
      return res.status(400).json({
        success: false,
        error: 'Import data is required'
      });
    }

    // Validate options
    const { error: optionsError, value: validatedOptions } = importOptionsSchema.validate(options || {});

    if (optionsError) {
      return res.status(400).json({
        success: false,
        error: optionsError.details[0].message
      });
    }

    const result = await importExportService.importWorkflow(
      importData,
      req.user.id,
      validatedOptions
    );

    logger.info('Workflow imported', {
      workflowId: result.workflowId,
      workflowName: result.workflow?.name,
      userId: req.user.id,
      skipped: result.skipped || false,
      replaced: result.replaced || false
    });

    const statusCode = result.skipped ? 200 : 201;

    res.status(statusCode).json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    logger.error('Failed to import workflow', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/workflows/import-batch
 * @desc    Import multiple workflows from JSON
 * @access  Private
 */
router.post('/import-batch', validateToken, async (req, res) => {
  try {
    const { importData, options } = req.body;

    if (!importData) {
      return res.status(400).json({
        success: false,
        error: 'Import data is required'
      });
    }

    // Validate options
    const { error: optionsError, value: validatedOptions } = importOptionsSchema.validate(options || {});

    if (optionsError) {
      return res.status(400).json({
        success: false,
        error: optionsError.details[0].message
      });
    }

    const result = await importExportService.importWorkflows(
      importData,
      req.user.id,
      validatedOptions
    );

    logger.info('Bulk workflow import completed', {
      total: result.total,
      imported: result.imported,
      failed: result.failed,
      userId: req.user.id
    });

    res.status(201).json({
      success: true,
      data: result,
      message: `Imported ${result.imported} of ${result.total} workflows`
    });
  } catch (error) {
    logger.error('Failed to import workflows', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   POST /api/workflows/validate-import
 * @desc    Validate workflow import data without importing
 * @access  Private
 */
router.post('/validate-import', validateToken, async (req, res) => {
  try {
    const { importData } = req.body;

    if (!importData) {
      return res.status(400).json({
        success: false,
        error: 'Import data is required'
      });
    }

    const validation = await importExportService.validateImport(importData);

    logger.info('Import validation completed', {
      valid: validation.valid,
      workflowName: validation.workflow?.name,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: validation,
      message: validation.valid
        ? 'Import data is valid'
        : `Import validation failed: ${validation.error}`
    });
  } catch (error) {
    logger.error('Import validation failed', {
      error: error.message,
      userId: req.user.id
    });

    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * @route   GET /api/workflows/export/documentation
 * @desc    Get import/export documentation
 * @access  Public
 */
router.get('/export/documentation', (req, res) => {
  const documentation = {
    overview: 'Import/Export API allows you to backup, share, and migrate workflows between environments',

    exportFormats: {
      single: {
        description: 'Export a single workflow',
        endpoint: 'POST /api/workflows/:workflowId/export',
        options: {
          includeMetadata: 'Include workflow ID, owner, timestamps (default: true)',
          includeStatistics: 'Include execution statistics (default: false)'
        }
      },
      multiple: {
        description: 'Export multiple workflows',
        endpoint: 'POST /api/workflows/export',
        body: {
          workflowIds: ['array of workflow UUIDs (max 100)'],
          options: 'Same as single export'
        }
      }
    },

    importOptions: {
      conflictResolution: {
        rename: 'Append timestamp to workflow name if conflict exists (default)',
        replace: 'Replace existing workflow with same name/ID',
        skip: 'Skip import if workflow already exists'
      },
      preserveIds: 'Use original workflow and step IDs from export (default: false)',
      status: 'Import workflow with specific status: draft, active, or inactive (default: draft)'
    },

    importEndpoints: {
      single: {
        endpoint: 'POST /api/workflows/import',
        body: {
          importData: 'JSON export data from export endpoint',
          options: 'Import options object'
        }
      },
      batch: {
        endpoint: 'POST /api/workflows/import-batch',
        body: {
          importData: 'JSON export data containing workflows array',
          options: 'Import options object'
        }
      },
      validate: {
        endpoint: 'POST /api/workflows/validate-import',
        description: 'Validate import data without actually importing',
        body: {
          importData: 'JSON export data to validate'
        }
      }
    },

    exportStructure: {
      single: {
        exportVersion: '1.0.0',
        exportedAt: 'ISO 8601 timestamp',
        workflow: {
          name: 'Workflow name',
          description: 'Workflow description',
          version: 'Workflow version number',
          trigger_type: 'manual, scheduled, or webhook',
          trigger_config: 'Trigger-specific configuration',
          definition: 'Workflow definition object',
          variables: 'Workflow variables',
          jsonlex_schema: 'JSONLex schema if applicable',
          steps: [
            {
              step_id: 'Unique step identifier',
              step_type: 'Step type',
              name: 'Step name',
              config: 'Step configuration',
              order: 'Step order'
            }
          ],
          metadata: 'Optional: ID, owner_id, timestamps',
          statistics: 'Optional: execution counts, durations'
        }
      },
      multiple: {
        exportVersion: '1.0.0',
        exportedAt: 'ISO 8601 timestamp',
        count: 'Number of workflows',
        workflows: ['Array of workflow objects']
      }
    },

    useCases: {
      backup: 'Regular workflow backups for disaster recovery',
      migration: 'Move workflows between development and production environments',
      sharing: 'Share workflow templates with team members',
      versioning: 'Manual versioning by exporting before major changes',
      templating: 'Create workflow templates from existing workflows'
    },

    examples: {
      exportSingle: `// Export single workflow with statistics
POST /api/workflows/abc-123/export
Authorization: Bearer YOUR_TOKEN
{
  "includeMetadata": true,
  "includeStatistics": true
}`,

      exportMultiple: `// Export multiple workflows
POST /api/workflows/export
Authorization: Bearer YOUR_TOKEN
{
  "workflowIds": ["abc-123", "def-456", "ghi-789"],
  "options": {
    "includeMetadata": true
  }
}`,

      importWithRename: `// Import workflow with rename on conflict
POST /api/workflows/import
Authorization: Bearer YOUR_TOKEN
{
  "importData": { /* exported workflow data */ },
  "options": {
    "conflictResolution": "rename",
    "status": "draft"
  }
}`,

      importReplace: `// Import and replace existing workflow
POST /api/workflows/import
Authorization: Bearer YOUR_TOKEN
{
  "importData": { /* exported workflow data */ },
  "options": {
    "conflictResolution": "replace",
    "status": "active"
  }
}`,

      validate: `// Validate import before executing
POST /api/workflows/validate-import
Authorization: Bearer YOUR_TOKEN
{
  "importData": { /* exported workflow data */ }
}

Response:
{
  "valid": true,
  "warnings": [
    "Workflow with name 'My Workflow' already exists"
  ],
  "workflow": {
    "name": "My Workflow",
    "stepCount": 5,
    "triggerType": "scheduled"
  }
}`
    },

    bestPractices: [
      'Always validate import data before importing',
      'Use includeMetadata: false when creating shareable templates',
      'Use conflictResolution: "skip" for bulk imports to avoid duplicates',
      'Set status: "draft" when importing to production for review',
      'Export with includeStatistics: true for performance analysis',
      'Keep export files in version control for audit trail',
      'Test imports in development environment first'
    ],

    securityNotes: [
      'Exported workflows contain trigger secrets (webhook secrets, API keys)',
      'Store export files securely',
      'Regenerate secrets after importing to new environment',
      'Import endpoint requires authentication',
      'Imported workflows inherit owner from authenticated user'
    ]
  };

  res.json({
    success: true,
    data: documentation
  });
});

module.exports = router;
