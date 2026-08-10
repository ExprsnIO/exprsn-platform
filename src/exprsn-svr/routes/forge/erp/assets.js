const express = require('express');
const router = express.Router();
const Joi = require('joi');
const assetService = require('../../../services/forge/erp/assetService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

// Asset Schemas
const createAssetSchema = Joi.object({
  assetName: Joi.string().max(255).required(),
  assetType: Joi.string().valid(
    'equipment', 'vehicle', 'furniture', 'computer', 'software',
    'building', 'land', 'leasehold_improvement', 'other'
  ).required(),
  category: Joi.string().max(100),
  serialNumber: Joi.string().max(100),
  model: Joi.string().max(100),
  manufacturer: Joi.string().max(100),
  purchaseDate: Joi.date().required(),
  purchasePrice: Joi.number().min(0).required(),
  salvageValue: Joi.number().min(0).default(0),
  currency: Joi.string().length(3).default('USD'),
  depreciationMethod: Joi.string().valid(
    'straight_line', 'declining_balance', 'sum_of_years_digits',
    'units_of_production', 'none'
  ).default('straight_line'),
  usefulLifeYears: Joi.number().integer().min(1),
  usefulLifeUnits: Joi.number().integer().min(1),
  departmentId: Joi.string().uuid(),
  assignedToEmployeeId: Joi.string().uuid(),
  location: Joi.string().max(255),
  supplierId: Joi.string().uuid(),
  description: Joi.string().allow(''),
  notes: Joi.string().allow(''),
  barcode: Joi.string().max(100),
  rfidTag: Joi.string().max(100),
  warrantyStartDate: Joi.date(),
  warrantyEndDate: Joi.date(),
  warrantyProvider: Joi.string().max(255),
  insured: Joi.boolean().default(false),
  insuranceProvider: Joi.string().max(255),
  insurancePolicyNumber: Joi.string().max(100)
});

const updateAssetSchema = Joi.object({
  assetName: Joi.string().max(255),
  category: Joi.string().max(100),
  location: Joi.string().max(255),
  departmentId: Joi.string().uuid(),
  assignedToEmployeeId: Joi.string().uuid(),
  status: Joi.string().valid(
    'active', 'in_use', 'in_storage', 'under_maintenance',
    'retired', 'sold', 'disposed', 'lost', 'stolen'
  ),
  condition: Joi.string().valid('excellent', 'good', 'fair', 'poor', 'broken'),
  description: Joi.string().allow(''),
  notes: Joi.string().allow('')
}).min(1);

const disposeAssetSchema = Joi.object({
  disposalDate: Joi.date().default(() => new Date()),
  disposalMethod: Joi.string().valid('sold', 'donated', 'scrapped', 'returned', 'traded', 'other').required(),
  disposalValue: Joi.number().min(0).default(0),
  disposalNotes: Joi.string().allow('')
});

const assignAssetSchema = Joi.object({
  employeeId: Joi.string().uuid().required()
});

// Maintenance Schedule Schemas
const createMaintenanceScheduleSchema = Joi.object({
  assetId: Joi.string().uuid().required(),
  maintenanceType: Joi.string().valid(
    'preventive', 'inspection', 'repair', 'calibration',
    'replacement', 'cleaning', 'upgrade', 'other'
  ).required(),
  title: Joi.string().max(255).required(),
  description: Joi.string().allow(''),
  isRecurring: Joi.boolean().default(false),
  frequency: Joi.string().valid(
    'daily', 'weekly', 'monthly', 'quarterly',
    'semi_annually', 'annually', 'one_time'
  ).default('one_time'),
  frequencyInterval: Joi.number().integer().min(1),
  startDate: Joi.date().required(),
  endDate: Joi.date(),
  nextDueDate: Joi.date(),
  assignedToEmployeeId: Joi.string().uuid(),
  assignedToDepartmentId: Joi.string().uuid(),
  assignedToVendor: Joi.string().max(255),
  estimatedCost: Joi.number().min(0),
  estimatedDuration: Joi.number().integer().min(1),
  priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium'),
  checklist: Joi.array().items(
    Joi.object({
      task: Joi.string().required(),
      completed: Joi.boolean().default(false),
      notes: Joi.string().allow('')
    })
  ),
  procedures: Joi.string().allow(''),
  safetyNotes: Joi.string().allow(''),
  requiredParts: Joi.array().items(
    Joi.object({
      partNumber: Joi.string().required(),
      name: Joi.string().required(),
      quantity: Joi.number().integer().min(1).required()
    })
  ),
  requiredTools: Joi.array().items(Joi.string()),
  requiresDowntime: Joi.boolean().default(false),
  estimatedDowntime: Joi.number().integer().min(1),
  reminderDaysBefore: Joi.number().integer().min(1)
});

const completeMaintenanceSchema = Joi.object({
  completedDate: Joi.date().default(() => new Date()),
  performedBy: Joi.string().required(),
  duration: Joi.number().integer().min(1),
  cost: Joi.number().min(0),
  notes: Joi.string().allow('')
});

// ===== Asset Routes =====

/**
 * POST /api/erp/assets
 * Create new asset
 */
router.post('/',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createAssetSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const asset = await assetService.createAsset(value);

      res.status(201).json({
        success: true,
        asset
      });
    } catch (err) {
      logger.error('Failed to create asset', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/assets
 * List assets
 */
router.get('/',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const filters = {
        assetType: req.query.assetType,
        status: req.query.status,
        departmentId: req.query.departmentId,
        assignedToEmployeeId: req.query.assignedToEmployeeId,
        search: req.query.search,
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await assetService.listAssets(filters);

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('Failed to list assets', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/assets/statistics
 * Get asset statistics
 */
router.get('/statistics',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const stats = await assetService.getAssetStatistics();

      res.json({
        success: true,
        statistics: stats
      });
    } catch (err) {
      logger.error('Failed to get asset statistics', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/assets/:id
 * Get asset by ID
 */
router.get('/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const asset = await assetService.getAssetById(req.params.id);

      res.json({
        success: true,
        asset
      });
    } catch (err) {
      const status = err.message === 'Asset not found' ? 404 : 500;
      logger.error('Failed to get asset', { error: err.message, assetId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * PUT /api/erp/assets/:id
 * Update asset
 */
router.put('/:id',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = updateAssetSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const asset = await assetService.updateAsset(req.params.id, value);

      res.json({
        success: true,
        asset
      });
    } catch (err) {
      const status = err.message === 'Asset not found' ? 404 : 400;
      logger.error('Failed to update asset', { error: err.message, assetId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'UPDATE_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/assets/:id/dispose
 * Dispose asset
 */
router.post('/:id/dispose',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = disposeAssetSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const asset = await assetService.disposeAsset(req.params.id, value);

      res.json({
        success: true,
        asset,
        message: 'Asset disposed successfully'
      });
    } catch (err) {
      logger.error('Failed to dispose asset', { error: err.message, assetId: req.params.id });
      res.status(400).json({
        success: false,
        error: 'DISPOSAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/assets/:id/assign
 * Assign asset to employee
 */
router.post('/:id/assign',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = assignAssetSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const asset = await assetService.assignAsset(req.params.id, value.employeeId);

      res.json({
        success: true,
        asset,
        message: 'Asset assigned successfully'
      });
    } catch (err) {
      logger.error('Failed to assign asset', { error: err.message, assetId: req.params.id });
      res.status(400).json({
        success: false,
        error: 'ASSIGNMENT_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/assets/:id/depreciation
 * Calculate asset depreciation
 */
router.get('/:id/depreciation',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const asOfDate = req.query.asOfDate ? new Date(req.query.asOfDate) : new Date();
      const depreciation = await assetService.calculateDepreciation(req.params.id, asOfDate);

      res.json({
        success: true,
        depreciation
      });
    } catch (err) {
      logger.error('Failed to calculate depreciation', { error: err.message, assetId: req.params.id });
      res.status(400).json({
        success: false,
        error: 'CALCULATION_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/assets/:id/depreciation
 * Record depreciation for asset
 */
router.post('/:id/depreciation',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const asset = await assetService.recordDepreciation(req.params.id);

      res.json({
        success: true,
        asset,
        message: 'Depreciation recorded successfully'
      });
    } catch (err) {
      logger.error('Failed to record depreciation', { error: err.message, assetId: req.params.id });
      res.status(400).json({
        success: false,
        error: 'RECORDING_ERROR',
        message: err.message
      });
    }
  }
);

// ===== Maintenance Schedule Routes =====

/**
 * POST /api/erp/assets/:id/maintenance-schedules
 * Create maintenance schedule for asset
 */
router.post('/:id/maintenance-schedules',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createMaintenanceScheduleSchema.validate({
        ...req.body,
        assetId: req.params.id
      });

      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const schedule = await assetService.createMaintenanceSchedule(value);

      res.status(201).json({
        success: true,
        schedule
      });
    } catch (err) {
      logger.error('Failed to create maintenance schedule', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/maintenance-schedules
 * List maintenance schedules
 */
router.get('/maintenance-schedules',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const filters = {
        assetId: req.query.assetId,
        status: req.query.status,
        maintenanceType: req.query.maintenanceType,
        priority: req.query.priority,
        overdue: req.query.overdue === 'true',
        limit: parseInt(req.query.limit) || 50,
        offset: parseInt(req.query.offset) || 0
      };

      const result = await assetService.listMaintenanceSchedules(filters);

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('Failed to list maintenance schedules', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/maintenance-schedules/:id
 * Get maintenance schedule by ID
 */
router.get('/maintenance-schedules/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const schedule = await assetService.getMaintenanceScheduleById(req.params.id);

      res.json({
        success: true,
        schedule
      });
    } catch (err) {
      const status = err.message === 'Maintenance schedule not found' ? 404 : 500;
      logger.error('Failed to get maintenance schedule', { error: err.message, scheduleId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/maintenance-schedules/:id/complete
 * Complete maintenance task
 */
router.post('/maintenance-schedules/:id/complete',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = completeMaintenanceSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const schedule = await assetService.completeMaintenance(req.params.id, value);

      res.json({
        success: true,
        schedule,
        message: 'Maintenance completed successfully'
      });
    } catch (err) {
      logger.error('Failed to complete maintenance', { error: err.message, scheduleId: req.params.id });
      res.status(400).json({
        success: false,
        error: 'COMPLETION_ERROR',
        message: err.message
      });
    }
  }
);

module.exports = router;
