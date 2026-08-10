const express = require('express');
const router = express.Router();
const { Workflow } = require('../models');
const { validateToken } = require('../middleware/auth');
const auditService = require('../services/auditService');
const logger = require('../utils/logger');
const Joi = require('joi');
const { Op } = require('sequelize');

/**
 * Validation schema for tags
 */
const tagSchema = Joi.string()
  .pattern(/^[a-zA-Z0-9-_]+$/)
  .min(1)
  .max(50)
  .messages({
    'string.pattern.base': 'Tags must contain only alphanumeric characters, hyphens, and underscores',
    'string.min': 'Tags must be at least 1 character long',
    'string.max': 'Tags must not exceed 50 characters'
  });

const updateTagsSchema = Joi.object({
  tags: Joi.array().items(tagSchema).min(0).max(50).required()
});

const bulkTagOperationSchema = Joi.object({
  workflowIds: Joi.array().items(Joi.string().uuid()).min(1).max(100).required(),
  operation: Joi.string().valid('add', 'remove', 'replace').required(),
  tags: Joi.array().items(tagSchema).min(1).max(50).required()
});

/**
 * @route   PUT /api/workflows/:id/tags
 * @desc    Update tags for a specific workflow
 * @access  Private
 */
router.put('/:id/tags', validateToken, async (req, res) => {
  try {
    const { error, value } = updateTagsSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { tags } = value;
    const workflowId = req.params.id;

    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    const oldTags = workflow.tags || [];

    // Update tags
    await workflow.update({ tags });

    // Log audit event
    await auditService.log({
      eventType: 'workflow_update',
      workflowId,
      userId: req.user.id,
      success: true,
      metadata: {
        field: 'tags',
        oldTags,
        newTags: tags,
        tagsAdded: tags.filter(t => !oldTags.includes(t)),
        tagsRemoved: oldTags.filter(t => !tags.includes(t))
      }
    });

    logger.info('Workflow tags updated', {
      workflowId,
      userId: req.user.id,
      oldTagsCount: oldTags.length,
      newTagsCount: tags.length
    });

    res.json({
      success: true,
      data: {
        workflowId,
        tags: workflow.tags
      },
      message: 'Workflow tags updated successfully'
    });
  } catch (error) {
    logger.error('Failed to update workflow tags', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to update workflow tags'
    });
  }
});

/**
 * @route   POST /api/workflows/:id/tags/add
 * @desc    Add tags to a workflow (append without replacing existing)
 * @access  Private
 */
router.post('/:id/tags/add', validateToken, async (req, res) => {
  try {
    const { error, value } = Joi.object({
      tags: Joi.array().items(tagSchema).min(1).max(50).required()
    }).validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { tags } = value;
    const workflowId = req.params.id;

    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    const currentTags = workflow.tags || [];
    const newTags = [...new Set([...currentTags, ...tags])]; // Deduplicate

    await workflow.update({ tags: newTags });

    // Log audit event
    await auditService.log({
      eventType: 'workflow_update',
      workflowId,
      userId: req.user.id,
      success: true,
      metadata: {
        operation: 'tags_add',
        tagsAdded: tags,
        resultingTags: newTags
      }
    });

    logger.info('Tags added to workflow', {
      workflowId,
      userId: req.user.id,
      tagsAdded: tags.length
    });

    res.json({
      success: true,
      data: {
        workflowId,
        tags: newTags,
        tagsAdded: tags
      },
      message: `Added ${tags.length} tag(s) to workflow`
    });
  } catch (error) {
    logger.error('Failed to add tags to workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to add tags to workflow'
    });
  }
});

/**
 * @route   POST /api/workflows/:id/tags/remove
 * @desc    Remove specific tags from a workflow
 * @access  Private
 */
router.post('/:id/tags/remove', validateToken, async (req, res) => {
  try {
    const { error, value } = Joi.object({
      tags: Joi.array().items(tagSchema).min(1).max(50).required()
    }).validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { tags } = value;
    const workflowId = req.params.id;

    const workflow = await Workflow.findByPk(workflowId);

    if (!workflow) {
      return res.status(404).json({
        success: false,
        error: 'Workflow not found'
      });
    }

    const currentTags = workflow.tags || [];
    const newTags = currentTags.filter(t => !tags.includes(t));

    await workflow.update({ tags: newTags });

    // Log audit event
    await auditService.log({
      eventType: 'workflow_update',
      workflowId,
      userId: req.user.id,
      success: true,
      metadata: {
        operation: 'tags_remove',
        tagsRemoved: tags,
        resultingTags: newTags
      }
    });

    logger.info('Tags removed from workflow', {
      workflowId,
      userId: req.user.id,
      tagsRemoved: tags.length
    });

    res.json({
      success: true,
      data: {
        workflowId,
        tags: newTags,
        tagsRemoved: tags
      },
      message: `Removed ${tags.length} tag(s) from workflow`
    });
  } catch (error) {
    logger.error('Failed to remove tags from workflow', {
      error: error.message,
      workflowId: req.params.id,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to remove tags from workflow'
    });
  }
});

/**
 * @route   GET /api/workflows/tags/all
 * @desc    Get all unique tags across all workflows with usage statistics
 * @access  Private
 */
router.get('/tags/all', validateToken, async (req, res) => {
  try {
    const workflows = await Workflow.findAll({
      attributes: ['tags'],
      where: {
        tags: {
          [Op.ne]: null
        }
      }
    });

    // Aggregate all tags and count usage
    const tagCounts = {};
    workflows.forEach(workflow => {
      (workflow.tags || []).forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    });

    // Sort by usage count descending
    const sortedTags = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .map(([tag, count]) => ({ tag, count }));

    res.json({
      success: true,
      data: {
        totalUniqueTags: sortedTags.length,
        totalWorkflowsWithTags: workflows.length,
        tags: sortedTags
      }
    });
  } catch (error) {
    logger.error('Failed to get all tags', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get all tags'
    });
  }
});

/**
 * @route   GET /api/workflows/tags/suggestions
 * @desc    Get tag suggestions based on partial input
 * @access  Private
 */
router.get('/tags/suggestions', validateToken, async (req, res) => {
  try {
    const { query, limit = 10 } = req.query;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Query parameter is required'
      });
    }

    const workflows = await Workflow.findAll({
      attributes: ['tags'],
      where: {
        tags: {
          [Op.ne]: null
        }
      }
    });

    // Find tags that match the query
    const queryLower = query.toLowerCase();
    const tagCounts = {};

    workflows.forEach(workflow => {
      (workflow.tags || []).forEach(tag => {
        if (tag.toLowerCase().includes(queryLower)) {
          tagCounts[tag] = (tagCounts[tag] || 0) + 1;
        }
      });
    });

    // Sort by usage count and limit results
    const suggestions = Object.entries(tagCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, parseInt(limit, 10))
      .map(([tag, count]) => ({ tag, count }));

    res.json({
      success: true,
      data: {
        query,
        suggestions
      }
    });
  } catch (error) {
    logger.error('Failed to get tag suggestions', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get tag suggestions'
    });
  }
});

/**
 * @route   POST /api/workflows/tags/bulk
 * @desc    Bulk tag operations across multiple workflows
 * @access  Private
 */
router.post('/tags/bulk', validateToken, async (req, res) => {
  try {
    const { error, value } = bulkTagOperationSchema.validate(req.body);

    if (error) {
      return res.status(400).json({
        success: false,
        error: error.details[0].message
      });
    }

    const { workflowIds, operation, tags } = value;

    const workflows = await Workflow.findAll({
      where: {
        id: workflowIds
      }
    });

    const results = [];
    const errors = [];

    for (const workflow of workflows) {
      try {
        const currentTags = workflow.tags || [];
        let newTags;

        switch (operation) {
          case 'add':
            newTags = [...new Set([...currentTags, ...tags])];
            break;
          case 'remove':
            newTags = currentTags.filter(t => !tags.includes(t));
            break;
          case 'replace':
            newTags = tags;
            break;
          default:
            throw new Error('Invalid operation');
        }

        await workflow.update({ tags: newTags });

        // Log audit event
        await auditService.log({
          eventType: 'workflow_update',
          workflowId: workflow.id,
          userId: req.user.id,
          success: true,
          metadata: {
            operation: `bulk_tags_${operation}`,
            oldTags: currentTags,
            newTags,
            tagsAffected: tags
          }
        });

        results.push({
          workflowId: workflow.id,
          workflowName: workflow.name,
          success: true,
          tags: newTags
        });
      } catch (err) {
        errors.push({
          workflowId: workflow.id,
          error: err.message
        });
      }
    }

    logger.info('Bulk tag operation completed', {
      operation,
      total: workflowIds.length,
      successful: results.length,
      failed: errors.length,
      userId: req.user.id
    });

    res.json({
      success: true,
      data: {
        operation,
        total: workflowIds.length,
        successful: results.length,
        failed: errors.length,
        results,
        errors
      },
      message: `${operation} operation completed on ${results.length} of ${workflowIds.length} workflows`
    });
  } catch (error) {
    logger.error('Failed to perform bulk tag operation', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to perform bulk tag operation'
    });
  }
});

/**
 * @route   GET /api/workflows/tags/statistics
 * @desc    Get tag usage statistics
 * @access  Private
 */
router.get('/tags/statistics', validateToken, async (req, res) => {
  try {
    const workflows = await Workflow.findAll({
      attributes: ['id', 'tags', 'status']
    });

    const stats = {
      totalWorkflows: workflows.length,
      workflowsWithTags: workflows.filter(w => w.tags && w.tags.length > 0).length,
      workflowsWithoutTags: workflows.filter(w => !w.tags || w.tags.length === 0).length,
      totalTags: 0,
      uniqueTags: 0,
      averageTagsPerWorkflow: 0,
      mostUsedTags: [],
      leastUsedTags: [],
      tagsByStatus: {}
    };

    // Count tags
    const tagCounts = {};
    const tagsByStatus = {};

    workflows.forEach(workflow => {
      const wTags = workflow.tags || [];
      stats.totalTags += wTags.length;

      wTags.forEach(tag => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;

        if (!tagsByStatus[workflow.status]) {
          tagsByStatus[workflow.status] = {};
        }
        tagsByStatus[workflow.status][tag] = (tagsByStatus[workflow.status][tag] || 0) + 1;
      });
    });

    stats.uniqueTags = Object.keys(tagCounts).length;
    stats.averageTagsPerWorkflow = stats.totalWorkflows > 0
      ? (stats.totalTags / stats.totalWorkflows).toFixed(2)
      : 0;

    // Most and least used tags
    const sortedTags = Object.entries(tagCounts).sort(([, a], [, b]) => b - a);
    stats.mostUsedTags = sortedTags.slice(0, 10).map(([tag, count]) => ({ tag, count }));
    stats.leastUsedTags = sortedTags.slice(-10).reverse().map(([tag, count]) => ({ tag, count }));

    // Tags by status
    stats.tagsByStatus = Object.entries(tagsByStatus).map(([status, tags]) => ({
      status,
      uniqueTags: Object.keys(tags).length,
      totalTags: Object.values(tags).reduce((sum, count) => sum + count, 0)
    }));

    res.json({
      success: true,
      data: stats
    });
  } catch (error) {
    logger.error('Failed to get tag statistics', {
      error: error.message,
      userId: req.user.id
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get tag statistics'
    });
  }
});

module.exports = router;
