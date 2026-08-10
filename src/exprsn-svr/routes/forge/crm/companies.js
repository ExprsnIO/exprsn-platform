const express = require('express');
const router = express.Router();
const { Company } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const companyService = require('../../../services/forge/crm/companyService');
const workflowIntegration = require('../../../services/forge/workflowIntegration');
const logger = require('../../../utils/logger');

// Validation schemas
const addressSchema = Joi.object({
  line1: Joi.string().max(255).optional(),
  line2: Joi.string().max(255).optional(),
  city: Joi.string().max(100).optional(),
  state: Joi.string().max(100).optional(),
  postalCode: Joi.string().max(20).optional(),
  country: Joi.string().max(100).optional()
});

const companyCreateSchema = Joi.object({
  name: Joi.string().max(255).required(),
  legalName: Joi.string().max(255).optional(),
  industry: Joi.string().max(100).optional(),
  website: Joi.string().uri().optional(),
  email: Joi.string().email().optional(),
  phone: Joi.string().max(50).optional(),
  fax: Joi.string().max(50).optional(),
  taxId: Joi.string().max(100).optional(),
  employeeCount: Joi.number().integer().positive().optional(),
  annualRevenue: Joi.number().positive().optional(),
  currency: Joi.string().length(3).optional(),
  billingAddress: addressSchema.optional(),
  shippingAddress: addressSchema.optional(),
  parentCompanyId: Joi.string().uuid().optional(),
  accountType: Joi.string().valid('prospect', 'customer', 'partner', 'vendor', 'competitor', 'former_customer').optional(),
  status: Joi.string().valid('active', 'inactive', 'archived').optional(),
  description: Joi.string().optional(),
  socialProfiles: Joi.object().optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  customFields: Joi.object().optional()
});

const companyUpdateSchema = companyCreateSchema.fork(
  ['name'],
  (schema) => schema.optional()
);

const companyMergeSchema = Joi.object({
  targetId: Joi.string().uuid().required(),
  deleteSource: Joi.boolean().optional().default(false)
});

const bulkImportSchema = Joi.object({
  companies: Joi.array().items(companyCreateSchema).min(1).max(1000).required()
});

// List companies
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    search: Joi.string().optional(),
    status: Joi.string().valid('active', 'inactive', 'archived').optional(),
    accountType: Joi.string().valid('prospect', 'customer', 'partner', 'vendor', 'competitor', 'former_customer').optional(),
    industry: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, search, status, accountType, industry, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = { ownerId: req.user.id };

      if (status) where.status = status;
      if (accountType) where.accountType = accountType;
      if (industry) where.industry = industry;

      // Search functionality
      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { legalName: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Company.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['name', 'ASC']]
      });

      res.json({
        success: true,
        companies: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list companies', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list companies'
      });
    }
  }
);

// Get company statistics
router.get('/stats',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const stats = await companyService.getCompanyStats(req.user.id);

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get company stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get company statistics'
      });
    }
  }
);

// Get company by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const company = await Company.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!company) {
        return res.status(404).json({
          success: false,
          error: 'Company not found'
        });
      }

      res.json({
        success: true,
        company
      });
    } catch (error) {
      logger.error('Failed to get company', { error: error.message, companyId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get company'
      });
    }
  }
);

// Get company hierarchy
router.get('/:id/hierarchy',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const hierarchy = await companyService.getCompanyHierarchy(req.params.id);

      res.json({
        success: true,
        hierarchy
      });
    } catch (error) {
      logger.error('Failed to get company hierarchy', { error: error.message, companyId: req.params.id });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get company contacts
router.get('/:id/contacts',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(schemas.pagination),
  async (req, res) => {
    try {
      const { page, limit } = req.query;
      const offset = (page - 1) * limit;

      const result = await companyService.getCompanyContacts(req.params.id, { limit, offset });

      res.json({
        success: true,
        contacts: result.contacts,
        pagination: {
          total: result.total,
          page,
          limit,
          pages: Math.ceil(result.total / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to get company contacts', { error: error.message, companyId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get company contacts'
      });
    }
  }
);

// Find duplicate companies
router.post('/find-duplicates',
  
  requirePermission('read'),
  validateBody(Joi.object({
    name: Joi.string().max(255).required()
  })),
  async (req, res) => {
    try {
      const duplicates = await companyService.findDuplicates(req.body.name, req.user.id);

      res.json({
        success: true,
        duplicates
      });
    } catch (error) {
      logger.error('Failed to find duplicates', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to find duplicate companies'
      });
    }
  }
);

// Create company
router.post('/',
  
  requirePermission('write'),
  validateBody(companyCreateSchema),
  async (req, res) => {
    try {
      const company = await Company.create({
        ...req.body,
        ownerId: req.user.id
      });

      // Trigger workflow
      await workflowIntegration.triggerCompanyWorkflow(company.id, 'created');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('company:created', { company });

      logger.info('Company created', {
        companyId: company.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        company
      });
    } catch (error) {
      logger.error('Failed to create company', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create company'
      });
    }
  }
);

// Bulk import companies
router.post('/bulk-import',
  
  requirePermission('write'),
  validateBody(bulkImportSchema),
  async (req, res) => {
    try {
      const results = await companyService.bulkImportCompanies(req.body.companies, req.user.id);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('companies:bulk-imported', { results });

      logger.info('Companies bulk imported', {
        userId: req.user.id,
        total: req.body.companies.length,
        created: results.created
      });

      res.status(201).json({
        success: true,
        results
      });
    } catch (error) {
      logger.error('Failed to bulk import companies', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to bulk import companies'
      });
    }
  }
);

// Update company
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(companyUpdateSchema),
  async (req, res) => {
    try {
      const company = await Company.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!company) {
        return res.status(404).json({
          success: false,
          error: 'Company not found'
        });
      }

      await company.update(req.body);

      // Trigger workflow
      await workflowIntegration.triggerCompanyWorkflow(company.id, 'updated');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('company:updated', { company });

      logger.info('Company updated', {
        companyId: company.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        company
      });
    } catch (error) {
      logger.error('Failed to update company', { error: error.message, companyId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update company'
      });
    }
  }
);

// Merge companies
router.post('/:id/merge',
  
  requirePermission('write'),
  validateParams(schemas.id),
  validateBody(companyMergeSchema),
  async (req, res) => {
    try {
      const company = await companyService.mergeCompanies(
        req.params.id,
        req.body.targetId,
        { deleteSource: req.body.deleteSource }
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('company:merged', {
        sourceId: req.params.id,
        targetId: req.body.targetId,
        company
      });

      logger.info('Companies merged', {
        sourceId: req.params.id,
        targetId: req.body.targetId,
        userId: req.user.id
      });

      res.json({
        success: true,
        company
      });
    } catch (error) {
      logger.error('Failed to merge companies', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Delete company
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const company = await Company.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!company) {
        return res.status(404).json({
          success: false,
          error: 'Company not found'
        });
      }

      await company.destroy();

      // Trigger workflow
      await workflowIntegration.triggerCompanyWorkflow(company.id, 'deleted');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('company:deleted', { companyId: company.id });

      logger.info('Company deleted', {
        companyId: company.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Company deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete company', { error: error.message, companyId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to delete company'
      });
    }
  }
);

module.exports = router;
