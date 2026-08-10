const express = require('express');
const router = express.Router();
const Joi = require('joi');
const projectService = require('../../../services/forge/erp/projectService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

const createProjectSchema = Joi.object({
  name: Joi.string().max(255).required(),
  description: Joi.string().allow(''),
  projectType: Joi.string().valid('internal', 'client', 'research', 'maintenance', 'product').default('internal'),
  status: Joi.string().valid('planning', 'active', 'on_hold', 'completed', 'cancelled').default('planning'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
  startDate: Joi.date().required(),
  endDate: Joi.date().greater(Joi.ref('startDate')).required(),
  budget: Joi.number().positive().allow(null),
  estimatedCost: Joi.number().positive().allow(null),
  estimatedHours: Joi.number().positive().allow(null),
  currency: Joi.string().length(3).default('USD'),
  billingType: Joi.string().valid('fixed_price', 'time_and_materials', 'retainer', 'non_billable').default('non_billable'),
  customerId: Joi.string().uuid().allow(null),
  companyId: Joi.string().uuid().allow(null),
  opportunityId: Joi.string().uuid().allow(null),
  projectManagerId: Joi.string().uuid().required(),
  teamMembers: Joi.array().items(Joi.string().uuid()).optional(),
  departmentId: Joi.string().uuid().allow(null),
  tags: Joi.array().items(Joi.string()).optional(),
  category: Joi.string().max(100).allow(null),
  notes: Joi.string().allow(''),
  milestones: Joi.array().items(Joi.object({
    name: Joi.string().required(),
    date: Joi.date().required(),
    description: Joi.string().allow(''),
    status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled').default('pending')
  })).optional(),
  customFields: Joi.object().optional()
});

const updateProjectSchema = Joi.object({
  name: Joi.string().max(255),
  description: Joi.string().allow(''),
  projectType: Joi.string().valid('internal', 'client', 'research', 'maintenance', 'product'),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical'),
  health: Joi.string().valid('on_track', 'at_risk', 'off_track').allow(null),
  startDate: Joi.date(),
  endDate: Joi.date(),
  budget: Joi.number().positive().allow(null),
  estimatedCost: Joi.number().positive().allow(null),
  estimatedHours: Joi.number().positive().allow(null),
  projectManagerId: Joi.string().uuid(),
  teamMembers: Joi.array().items(Joi.string().uuid()),
  departmentId: Joi.string().uuid().allow(null),
  tags: Joi.array().items(Joi.string()),
  category: Joi.string().max(100).allow(null),
  notes: Joi.string().allow(''),
  customFields: Joi.object()
}).min(1);

const updateStatusSchema = Joi.object({
  status: Joi.string().valid('planning', 'active', 'on_hold', 'completed', 'cancelled').required(),
  notes: Joi.string().allow('').optional()
});

const milestoneSchema = Joi.object({
  name: Joi.string().required(),
  date: Joi.date().required(),
  description: Joi.string().allow(''),
  status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled').default('pending')
});

const updateMilestoneSchema = Joi.object({
  name: Joi.string(),
  date: Joi.date(),
  description: Joi.string().allow(''),
  status: Joi.string().valid('pending', 'in_progress', 'completed', 'cancelled')
}).min(1);

const budgetSchema = Joi.object({
  budget: Joi.number().positive().allow(null),
  estimatedCost: Joi.number().positive().allow(null),
  actualCost: Joi.number().positive().allow(null)
}).min(1);

const timeTrackingSchema = Joi.object({
  employeeId: Joi.string().uuid().required(),
  hours: Joi.number().positive().required(),
  date: Joi.date().required(),
  description: Joi.string().allow(''),
  billable: Joi.boolean().default(true)
});

// ===== Routes =====

// Get all projects
router.get('/',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const {
        status,
        priority,
        projectType,
        health,
        projectManagerId,
        customerId,
        departmentId,
        tags,
        search,
        startDate,
        endDate,
        page = 1,
        limit = 50,
        sortBy = 'createdAt',
        sortOrder = 'DESC'
      } = req.query;

      const offset = (page - 1) * limit;

      const result = await projectService.listProjects({
        status,
        priority,
        projectType,
        health,
        projectManagerId,
        customerId,
        departmentId,
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) : undefined,
        search,
        startDate,
        endDate,
        limit: parseInt(limit),
        offset,
        sortBy,
        sortOrder
      });

      res.json({
        success: true,
        projects: result.projects,
        pagination: {
          total: result.total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list projects', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list projects'
      });
    }
  }
);

// Get project statistics dashboard
router.get('/dashboard',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { projectManagerId, departmentId, status } = req.query;

      const stats = await projectService.getDashboardStatistics({
        projectManagerId,
        departmentId,
        status
      });

      res.json({
        success: true,
        statistics: stats
      });
    } catch (error) {
      logger.error('Failed to get dashboard statistics', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get dashboard statistics'
      });
    }
  }
);

// Get project by ID
router.get('/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const project = await projectService.getProjectById(req.params.id, true);

      res.json({
        success: true,
        project
      });
    } catch (error) {
      logger.error('Failed to get project', { error: error.message });
      res.status(404).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Create project
router.post('/',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createProjectSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const project = await projectService.createProject(value);

      res.status(201).json({
        success: true,
        project
      });
    } catch (error) {
      logger.error('Failed to create project', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update project
router.put('/:id',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const { error, value } = updateProjectSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const project = await projectService.updateProject(req.params.id, value);

      res.json({
        success: true,
        project
      });
    } catch (error) {
      logger.error('Failed to update project', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete project
router.delete('/:id',
  
  requirePermission('delete'),
  async (req, res) => {
    try {
      await projectService.deleteProject(req.params.id);

      res.json({
        success: true,
        message: 'Project deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete project', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update project status
router.patch('/:id/status',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const { error, value } = updateStatusSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const project = await projectService.updateProjectStatus(
        req.params.id,
        value.status,
        value.notes
      );

      res.json({
        success: true,
        project
      });
    } catch (error) {
      logger.error('Failed to update project status', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Add milestone
router.post('/:id/milestones',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = milestoneSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const milestone = await projectService.addMilestone(req.params.id, value);

      res.status(201).json({
        success: true,
        milestone
      });
    } catch (error) {
      logger.error('Failed to add milestone', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update milestone
router.put('/:id/milestones/:milestoneId',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const { error, value } = updateMilestoneSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const milestone = await projectService.updateMilestone(
        req.params.id,
        req.params.milestoneId,
        value
      );

      res.json({
        success: true,
        milestone
      });
    } catch (error) {
      logger.error('Failed to update milestone', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Update budget
router.patch('/:id/budget',
  
  requirePermission('update'),
  async (req, res) => {
    try {
      const { error, value } = budgetSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await projectService.updateBudget(req.params.id, value);

      res.json({
        success: true,
        project: result.project,
        budgetVariance: result.budgetVariance,
        budgetVariancePercent: result.budgetVariancePercent
      });
    } catch (error) {
      logger.error('Failed to update budget', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Track time on project
router.post('/:id/time',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = timeTrackingSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await projectService.trackTime(req.params.id, value);

      res.status(201).json({
        success: true,
        timeEntry: result.timeEntry,
        projectActualHours: result.projectActualHours
      });
    } catch (error) {
      logger.error('Failed to track time', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Calculate project completion
router.post('/:id/calculate-completion',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const result = await projectService.calculateCompletion(req.params.id);

      res.json({
        success: true,
        ...result
      });
    } catch (error) {
      logger.error('Failed to calculate completion', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get project statistics
router.get('/:id/statistics',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const stats = await projectService.getProjectStatistics(req.params.id);

      res.json({
        success: true,
        statistics: stats
      });
    } catch (error) {
      logger.error('Failed to get project statistics', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

module.exports = router;
