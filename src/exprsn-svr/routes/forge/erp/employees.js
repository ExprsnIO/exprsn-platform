const express = require('express');
const router = express.Router();
const Joi = require('joi');
const hrService = require('../../../services/forge/erp/hrService');
const { requirePermission } = require('../../../middleware/auth');
const logger = require('../../../utils/logger');

// ===== Validation Schemas =====

const createEmployeeSchema = Joi.object({
  firstName: Joi.string().max(100).required(),
  lastName: Joi.string().max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().max(20),
  dateOfBirth: Joi.date(),
  gender: Joi.string().valid('male', 'female', 'other', 'prefer_not_to_say'),
  address: Joi.string().allow(''),
  city: Joi.string().max(100),
  state: Joi.string().max(50),
  postalCode: Joi.string().max(20),
  country: Joi.string().max(100).default('USA'),
  departmentId: Joi.string().uuid(),
  jobTitle: Joi.string().max(200).required(),
  employmentType: Joi.string().valid('full_time', 'part_time', 'contract', 'temporary', 'intern').required(),
  hireDate: Joi.date().required(),
  salary: Joi.number().min(0).required(),
  payFrequency: Joi.string().valid('weekly', 'bi_weekly', 'semi_monthly', 'monthly').default('bi_weekly'),
  managerId: Joi.string().uuid(),
  status: Joi.string().valid('active', 'on_leave', 'terminated', 'suspended').default('active'),
  emergencyContact: Joi.object({
    name: Joi.string().required(),
    relationship: Joi.string().required(),
    phone: Joi.string().required()
  }),
  taxId: Joi.string().allow(''),
  bankAccountNumber: Joi.string().allow(''),
  bankRoutingNumber: Joi.string().allow('')
});

const updateEmployeeSchema = Joi.object({
  firstName: Joi.string().max(100),
  lastName: Joi.string().max(100),
  email: Joi.string().email(),
  phone: Joi.string().max(20),
  address: Joi.string().allow(''),
  city: Joi.string().max(100),
  state: Joi.string().max(50),
  postalCode: Joi.string().max(20),
  departmentId: Joi.string().uuid(),
  jobTitle: Joi.string().max(200),
  employmentType: Joi.string().valid('full_time', 'part_time', 'contract', 'temporary', 'intern'),
  salary: Joi.number().min(0),
  payFrequency: Joi.string().valid('weekly', 'bi_weekly', 'semi_monthly', 'monthly'),
  managerId: Joi.string().uuid(),
  status: Joi.string().valid('active', 'on_leave', 'suspended'),
  emergencyContact: Joi.object({
    name: Joi.string().required(),
    relationship: Joi.string().required(),
    phone: Joi.string().required()
  }),
  bankAccountNumber: Joi.string().allow(''),
  bankRoutingNumber: Joi.string().allow('')
}).min(1);

const terminateEmployeeSchema = Joi.object({
  reason: Joi.string().required(),
  terminationDate: Joi.date().default(() => new Date())
});

const listEmployeesSchema = Joi.object({
  departmentId: Joi.string().uuid(),
  managerId: Joi.string().uuid(),
  status: Joi.string().valid('active', 'on_leave', 'terminated', 'suspended'),
  employmentType: Joi.string().valid('full_time', 'part_time', 'contract', 'temporary', 'intern'),
  search: Joi.string(),
  limit: Joi.number().integer().min(1).max(100).default(50),
  offset: Joi.number().integer().min(0).default(0)
});

// ===== Routes =====

/**
 * POST /api/erp/employees
 * Create new employee
 */
router.post('/',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = createEmployeeSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const employee = await hrService.createEmployee(value);

      res.status(201).json({
        success: true,
        employee
      });
    } catch (err) {
      logger.error('Failed to create employee', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/employees
 * List employees
 */
router.get('/',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { error, value } = listEmployeesSchema.validate(req.query);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const result = await hrService.listEmployees(value);

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('Failed to list employees', { error: err.message });
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * GET /api/erp/employees/:id
 * Get employee by ID
 */
router.get('/:id',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const employee = await hrService.getEmployeeById(req.params.id);

      res.json({
        success: true,
        employee
      });
    } catch (err) {
      const status = err.message === 'Employee not found' ? 404 : 500;
      logger.error('Failed to get employee', { error: err.message, employeeId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'INTERNAL_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * PUT /api/erp/employees/:id
 * Update employee
 */
router.put('/:id',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = updateEmployeeSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const employee = await hrService.updateEmployee(req.params.id, value);

      res.json({
        success: true,
        employee
      });
    } catch (err) {
      const status = err.message === 'Employee not found' ? 404 : 400;
      logger.error('Failed to update employee', { error: err.message, employeeId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'UPDATE_ERROR',
        message: err.message
      });
    }
  }
);

/**
 * POST /api/erp/employees/:id/terminate
 * Terminate employee
 */
router.post('/:id/terminate',
  
  requirePermission('write'),
  async (req, res) => {
    try {
      const { error, value } = terminateEmployeeSchema.validate(req.body);
      if (error) {
        return res.status(400).json({
          success: false,
          error: 'VALIDATION_ERROR',
          message: error.details[0].message
        });
      }

      const employee = await hrService.terminateEmployee(
        req.params.id,
        value.reason,
        value.terminationDate
      );

      res.json({
        success: true,
        employee,
        message: 'Employee terminated successfully'
      });
    } catch (err) {
      const status = err.message === 'Employee not found' ? 404 : 400;
      logger.error('Failed to terminate employee', { error: err.message, employeeId: req.params.id });
      res.status(status).json({
        success: false,
        error: status === 404 ? 'NOT_FOUND' : 'TERMINATION_ERROR',
        message: err.message
      });
    }
  }
);

module.exports = router;
