const express = require('express');
const router = express.Router();
const { Contact } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const workflowIntegration = require('../../../services/forge/workflowIntegration');
const contactService = require('../../../services/forge/crm/contactService');
const logger = require('../../../utils/logger');

// Validation schemas
const contactCreateSchema = Joi.object({
  firstName: Joi.string().max(100).required(),
  lastName: Joi.string().max(100).required(),
  email: Joi.string().email().optional(),
  phone: Joi.string().max(50).optional(),
  mobile: Joi.string().max(50).optional(),
  jobTitle: Joi.string().max(200).optional(),
  companyName: Joi.string().max(255).optional(),
  website: Joi.string().uri().optional(),
  addressLine1: Joi.string().max(255).optional(),
  addressLine2: Joi.string().max(255).optional(),
  city: Joi.string().max(100).optional(),
  state: Joi.string().max(100).optional(),
  postalCode: Joi.string().max(20).optional(),
  country: Joi.string().max(100).optional(),
  source: Joi.string().max(100).optional(),
  tags: Joi.array().items(Joi.string()).optional(),
  customFields: Joi.object().optional()
});

const contactUpdateSchema = contactCreateSchema.fork(
  ['firstName', 'lastName'],
  (schema) => schema.optional()
);

// List contacts
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    search: Joi.string().optional(),
    status: Joi.string().valid('active', 'inactive', 'archived').optional(),
    source: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, search, status, source, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = { ownerId: req.user.id };

      if (status) where.status = status;
      if (source) where.source = source;

      // Search functionality
      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { firstName: { [Op.iLike]: `%${search}%` } },
          { lastName: { [Op.iLike]: `%${search}%` } },
          { email: { [Op.iLike]: `%${search}%` } },
          { companyName: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Contact.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['createdAt', 'DESC']]
      });

      res.json({
        success: true,
        contacts: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list contacts', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list contacts'
      });
    }
  }
);

// Get contact by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const contact = await Contact.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!contact) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }

      res.json({
        success: true,
        contact
      });
    } catch (error) {
      logger.error('Failed to get contact', { error: error.message, contactId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get contact'
      });
    }
  }
);

// Create contact
router.post('/',
  
  requirePermission('write'),
  validateBody(contactCreateSchema),
  async (req, res) => {
    try {
      const contact = await Contact.create({
        ...req.body,
        ownerId: req.user.id
      });

      // Trigger workflow
      await workflowIntegration.triggerContactWorkflow(contact.id, 'created');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('contact:created', { contact });

      logger.info('Contact created', {
        contactId: contact.id,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        contact
      });
    } catch (error) {
      logger.error('Failed to create contact', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to create contact'
      });
    }
  }
);

// Update contact
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(contactUpdateSchema),
  async (req, res) => {
    try {
      const contact = await Contact.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!contact) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }

      await contact.update(req.body);

      // Trigger workflow
      await workflowIntegration.triggerContactWorkflow(contact.id, 'updated');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('contact:updated', { contact });

      logger.info('Contact updated', {
        contactId: contact.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        contact
      });
    } catch (error) {
      logger.error('Failed to update contact', { error: error.message, contactId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update contact'
      });
    }
  }
);

// Delete contact
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const contact = await Contact.findOne({
        where: {
          id: req.params.id,
          ownerId: req.user.id
        }
      });

      if (!contact) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }

      await contact.destroy();

      // Trigger workflow
      await workflowIntegration.triggerContactWorkflow(contact.id, 'deleted');

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('contact:deleted', { contactId: contact.id });

      logger.info('Contact deleted', {
        contactId: contact.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Contact deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete contact', { error: error.message, contactId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to delete contact'
      });
    }
  }
);

// Find duplicate contacts
router.post('/:id/find-duplicates',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const contact = await Contact.findByPk(req.params.id);

      if (!contact) {
        return res.status(404).json({
          success: false,
          error: 'Contact not found'
        });
      }

      const duplicates = await contactService.findDuplicates(contact.toJSON(), contact.id);

      res.json({
        success: true,
        duplicates
      });
    } catch (error) {
      logger.error('Failed to find duplicates', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to find duplicates'
      });
    }
  }
);

// Merge contacts
router.post('/:id/merge',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    secondaryId: Joi.string().uuid().required(),
    mergeStrategy: Joi.object({
      preferSecondary: Joi.array().items(Joi.string()).optional()
    }).optional()
  })),
  async (req, res) => {
    try {
      const { secondaryId, mergeStrategy } = req.body;

      const mergedContact = await contactService.mergeContacts(
        req.params.id,
        secondaryId,
        mergeStrategy
      );

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.to(`user:${req.user.id}`).emit('contact:merged', {
        primaryId: req.params.id,
        secondaryId,
        mergedContact
      });

      logger.info('Contacts merged', {
        primaryId: req.params.id,
        secondaryId,
        userId: req.user.id
      });

      res.json({
        success: true,
        contact: mergedContact
      });
    } catch (error) {
      logger.error('Failed to merge contacts', { error: error.message });
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
);

// Get contact timeline
router.get('/:id/timeline',
  
  requirePermission('read'),
  validateParams(schemas.id),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).default(50),
    offset: Joi.number().integer().min(0).default(0),
    activityType: Joi.string().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional()
  })),
  async (req, res) => {
    try {
      const timeline = await contactService.getContactTimeline(req.params.id, req.query);

      res.json({
        success: true,
        ...timeline
      });
    } catch (error) {
      logger.error('Failed to get contact timeline', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get contact timeline'
      });
    }
  }
);

// Segment contacts
router.post('/segment',
  
  requirePermission('read'),
  validateBody(Joi.object({
    tags: Joi.array().items(Joi.string()).optional(),
    companyId: Joi.string().uuid().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    country: Joi.string().optional(),
    jobTitles: Joi.array().items(Joi.string()).optional(),
    hasActivity: Joi.boolean().optional(),
    activitySince: Joi.date().iso().optional(),
    customFieldFilters: Joi.array().items(Joi.object({
      field: Joi.string().required(),
      operator: Joi.string().valid('equals', 'contains').required(),
      value: Joi.any().required()
    })).optional()
  })),
  async (req, res) => {
    try {
      const contacts = await contactService.segmentContacts(req.body);

      res.json({
        success: true,
        contacts,
        count: contacts.length
      });
    } catch (error) {
      logger.error('Failed to segment contacts', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to segment contacts'
      });
    }
  }
);

// Export contacts
router.post('/export',
  
  requirePermission('read'),
  validateBody(Joi.object({
    filters: Joi.object().optional(),
    format: Joi.string().valid('json', 'csv', 'vcard').default('json')
  })),
  async (req, res) => {
    try {
      const { filters, format } = req.body;
      const exportData = await contactService.exportContacts(filters, format);

      // Set appropriate headers based on format
      if (format === 'csv') {
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
        const csvContent = [
          exportData.headers.join(','),
          ...exportData.rows.map(row => row.join(','))
        ].join('\n');
        res.send(csvContent);
      } else if (format === 'vcard') {
        res.setHeader('Content-Type', 'text/vcard');
        res.setHeader('Content-Disposition', 'attachment; filename=contacts.vcf');
        res.send(exportData.data);
      } else {
        res.json({
          success: true,
          ...exportData
        });
      }
    } catch (error) {
      logger.error('Failed to export contacts', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to export contacts'
      });
    }
  }
);

// Bulk import contacts
router.post('/import',
  
  requirePermission('write'),
  validateBody(Joi.object({
    contacts: Joi.array().items(contactCreateSchema).required(),
    options: Joi.object({
      checkDuplicates: Joi.boolean().default(true),
      autoMerge: Joi.boolean().default(false),
      skipDuplicates: Joi.boolean().default(true)
    }).optional()
  })),
  async (req, res) => {
    try {
      const { contacts, options } = req.body;
      const results = await contactService.bulkImportContacts(contacts, options);

      res.json({
        success: true,
        ...results
      });
    } catch (error) {
      logger.error('Failed to import contacts', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to import contacts'
      });
    }
  }
);

// Get contact statistics
router.get('/stats/overview',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const stats = await contactService.getContactStats({ ownerId: req.user.id });

      res.json({
        success: true,
        stats
      });
    } catch (error) {
      logger.error('Failed to get contact stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get contact stats'
      });
    }
  }
);

module.exports = router;
