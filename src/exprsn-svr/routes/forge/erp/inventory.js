const express = require('express');
const router = express.Router();
const { Inventory, Product } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const logger = require('../../../utils/logger');

// Validation schemas
const inventoryCreateSchema = Joi.object({
  productId: Joi.string().uuid().required(),
  locationId: Joi.string().uuid().required(),
  quantityOnHand: Joi.number().integer().min(0).optional(),
  quantityReserved: Joi.number().integer().min(0).optional(),
  quantityAvailable: Joi.number().integer().min(0).optional(),
  quantityOnOrder: Joi.number().integer().min(0).optional(),
  reorderPoint: Joi.number().integer().min(0).optional(),
  reorderQuantity: Joi.number().integer().min(0).optional(),
  maxStock: Joi.number().integer().min(0).optional(),
  minStock: Joi.number().integer().min(0).optional(),
  autoReorder: Joi.boolean().optional(),
  costingMethod: Joi.string().valid('fifo', 'lifo', 'average', 'standard').optional(),
  averageCost: Joi.number().precision(2).positive().optional(),
  lastCost: Joi.number().precision(2).positive().optional(),
  standardCost: Joi.number().precision(2).positive().optional(),
  trackingMethod: Joi.string().valid('none', 'serial', 'lot', 'batch').optional(),
  serialNumbers: Joi.array().optional(),
  lotNumbers: Joi.array().optional(),
  binLocation: Joi.string().max(100).optional(),
  aisle: Joi.string().max(50).optional(),
  shelf: Joi.string().max(50).optional(),
  status: Joi.string().valid('active', 'inactive', 'discontinued').optional(),
  notes: Joi.string().optional(),
  metadata: Joi.object().optional()
});

const inventoryUpdateSchema = inventoryCreateSchema.fork(
  ['productId', 'locationId'],
  (schema) => schema.optional()
);

// List inventory items
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    productId: Joi.string().uuid().optional(),
    locationId: Joi.string().uuid().optional(),
    reorderStatus: Joi.string().valid('normal', 'low_stock', 'reorder_needed', 'critical', 'overstock').optional(),
    status: Joi.string().valid('active', 'inactive', 'discontinued').optional(),
    search: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, productId, locationId, reorderStatus, status, search, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      if (productId) where.productId = productId;
      if (locationId) where.locationId = locationId;
      if (reorderStatus) where.reorderStatus = reorderStatus;
      if (status) where.status = status;

      // Search functionality (search by product name or SKU)
      if (search) {
        const { Op } = require('sequelize');
        // We'll search in the included Product model
      }

      const { count, rows } = await Inventory.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['updatedAt', 'DESC']],
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'sku', 'name', 'category', 'unitPrice'],
            ...(search && {
              where: {
                [require('sequelize').Op.or]: [
                  { name: { [require('sequelize').Op.iLike]: `%${search}%` } },
                  { sku: { [require('sequelize').Op.iLike]: `%${search}%` } }
                ]
              }
            })
          }
        ]
      });

      res.json({
        success: true,
        inventory: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list inventory', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list inventory'
      });
    }
  }
);

// Get inventory item by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const inventory = await Inventory.findByPk(req.params.id, {
        include: [
          {
            model: Product,
            as: 'product'
          }
        ]
      });

      if (!inventory) {
        return res.status(404).json({
          success: false,
          error: 'Inventory item not found'
        });
      }

      res.json({
        success: true,
        inventory
      });
    } catch (error) {
      logger.error('Failed to get inventory item', { error: error.message, inventoryId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get inventory item'
      });
    }
  }
);

// Get low stock items
router.get('/status/low-stock',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    locationId: Joi.string().uuid().optional(),
    limit: Joi.number().integer().min(1).max(1000).optional().default(100)
  })),
  async (req, res) => {
    try {
      const { locationId, limit } = req.query;
      const { Op } = require('sequelize');

      const where = {
        reorderStatus: {
          [Op.in]: ['low_stock', 'reorder_needed', 'critical']
        },
        status: 'active'
      };

      if (locationId) where.locationId = locationId;

      const items = await Inventory.findAll({
        where,
        limit,
        order: [['reorderStatus', 'DESC'], ['quantityAvailable', 'ASC']],
        include: [
          {
            model: Product,
            as: 'product',
            attributes: ['id', 'sku', 'name', 'category', 'unitPrice']
          }
        ]
      });

      res.json({
        success: true,
        items,
        count: items.length
      });
    } catch (error) {
      logger.error('Failed to get low stock items', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get low stock items'
      });
    }
  }
);

// Create inventory record
router.post('/',
  
  requirePermission('write'),
  validateBody(inventoryCreateSchema),
  async (req, res) => {
    try {
      // Check if product exists
      const product = await Product.findByPk(req.body.productId);
      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      // Calculate available quantity
      const quantityOnHand = req.body.quantityOnHand || 0;
      const quantityReserved = req.body.quantityReserved || 0;
      const quantityAvailable = quantityOnHand - quantityReserved;

      // Calculate reorder status
      const reorderPoint = req.body.reorderPoint || 0;
      let reorderStatus = 'normal';
      if (quantityAvailable === 0) {
        reorderStatus = 'critical';
      } else if (quantityAvailable <= reorderPoint * 0.5) {
        reorderStatus = 'critical';
      } else if (quantityAvailable <= reorderPoint) {
        reorderStatus = 'reorder_needed';
      } else if (quantityAvailable <= reorderPoint * 1.5) {
        reorderStatus = 'low_stock';
      }

      // Calculate total value
      const totalValue = quantityOnHand * (req.body.averageCost || product.unitPrice || 0);

      const inventory = await Inventory.create({
        ...req.body,
        quantityAvailable,
        reorderStatus,
        totalValue
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('inventory:created', { inventory });

      logger.info('Inventory record created', {
        inventoryId: inventory.id,
        productId: req.body.productId,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        inventory
      });
    } catch (error) {
      logger.error('Failed to create inventory record', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message.includes('unique') ? 'Inventory record already exists for this product and location' : 'Failed to create inventory record'
      });
    }
  }
);

// Update inventory
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(inventoryUpdateSchema),
  async (req, res) => {
    try {
      const inventory = await Inventory.findByPk(req.params.id);

      if (!inventory) {
        return res.status(404).json({
          success: false,
          error: 'Inventory item not found'
        });
      }

      // Recalculate available quantity if needed
      let updateData = { ...req.body };
      if (req.body.quantityOnHand !== undefined || req.body.quantityReserved !== undefined) {
        const quantityOnHand = req.body.quantityOnHand !== undefined ? req.body.quantityOnHand : inventory.quantityOnHand;
        const quantityReserved = req.body.quantityReserved !== undefined ? req.body.quantityReserved : inventory.quantityReserved;
        updateData.quantityAvailable = quantityOnHand - quantityReserved;

        // Recalculate reorder status
        const reorderPoint = updateData.reorderPoint !== undefined ? updateData.reorderPoint : inventory.reorderPoint;
        if (updateData.quantityAvailable === 0) {
          updateData.reorderStatus = 'critical';
        } else if (updateData.quantityAvailable <= reorderPoint * 0.5) {
          updateData.reorderStatus = 'critical';
        } else if (updateData.quantityAvailable <= reorderPoint) {
          updateData.reorderStatus = 'reorder_needed';
        } else if (updateData.quantityAvailable <= reorderPoint * 1.5) {
          updateData.reorderStatus = 'low_stock';
        } else {
          updateData.reorderStatus = 'normal';
        }

        // Recalculate total value
        const cost = updateData.averageCost !== undefined ? updateData.averageCost : inventory.averageCost;
        updateData.totalValue = quantityOnHand * (cost || 0);
      }

      updateData.lastMovementDate = new Date();

      await inventory.update(updateData);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('inventory:updated', { inventory });

      logger.info('Inventory updated', {
        inventoryId: inventory.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        inventory
      });
    } catch (error) {
      logger.error('Failed to update inventory', { error: error.message, inventoryId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update inventory'
      });
    }
  }
);

// Adjust stock levels
router.post('/:id/adjust',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    quantityAdjustment: Joi.number().integer().required(),
    adjustmentType: Joi.string().valid('received', 'sold', 'damaged', 'returned', 'adjustment', 'transfer').required(),
    reason: Joi.string().max(500).optional(),
    referenceId: Joi.string().uuid().optional(),
    notes: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const inventory = await Inventory.findByPk(req.params.id, {
        include: [
          {
            model: Product,
            as: 'product'
          }
        ]
      });

      if (!inventory) {
        return res.status(404).json({
          success: false,
          error: 'Inventory item not found'
        });
      }

      const { quantityAdjustment, adjustmentType, reason, referenceId, notes } = req.body;

      // Calculate new quantities
      const newQuantityOnHand = inventory.quantityOnHand + quantityAdjustment;

      if (newQuantityOnHand < 0) {
        return res.status(400).json({
          success: false,
          error: 'Adjustment would result in negative stock'
        });
      }

      const newQuantityAvailable = newQuantityOnHand - inventory.quantityReserved;

      // Calculate new reorder status
      let reorderStatus = 'normal';
      const reorderPoint = inventory.reorderPoint || 0;
      if (newQuantityAvailable === 0) {
        reorderStatus = 'critical';
      } else if (newQuantityAvailable <= reorderPoint * 0.5) {
        reorderStatus = 'critical';
      } else if (newQuantityAvailable <= reorderPoint) {
        reorderStatus = 'reorder_needed';
      } else if (newQuantityAvailable <= reorderPoint * 1.5) {
        reorderStatus = 'low_stock';
      }

      // Calculate new total value
      const totalValue = newQuantityOnHand * (inventory.averageCost || 0);

      await inventory.update({
        quantityOnHand: newQuantityOnHand,
        quantityAvailable: newQuantityAvailable,
        reorderStatus,
        totalValue,
        lastMovementDate: new Date()
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('inventory:adjusted', {
        inventory,
        adjustment: {
          quantity: quantityAdjustment,
          type: adjustmentType,
          reason
        }
      });

      logger.info('Inventory adjusted', {
        inventoryId: inventory.id,
        productId: inventory.productId,
        adjustment: quantityAdjustment,
        type: adjustmentType,
        reason,
        userId: req.user.id
      });

      res.json({
        success: true,
        inventory,
        previousQuantity: inventory.quantityOnHand - quantityAdjustment,
        newQuantity: newQuantityOnHand,
        adjustment: {
          quantity: quantityAdjustment,
          type: adjustmentType,
          reason,
          referenceId
        }
      });
    } catch (error) {
      logger.error('Failed to adjust inventory', { error: error.message, inventoryId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to adjust inventory'
      });
    }
  }
);

// Reserve inventory for order
router.post('/:id/reserve',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    quantity: Joi.number().integer().min(1).required(),
    orderId: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const inventory = await Inventory.findByPk(req.params.id);

      if (!inventory) {
        return res.status(404).json({
          success: false,
          error: 'Inventory item not found'
        });
      }

      if (inventory.quantityAvailable < req.body.quantity) {
        return res.status(400).json({
          success: false,
          error: 'Insufficient available quantity',
          available: inventory.quantityAvailable,
          requested: req.body.quantity
        });
      }

      const newQuantityReserved = inventory.quantityReserved + req.body.quantity;
      const newQuantityAvailable = inventory.quantityOnHand - newQuantityReserved;

      await inventory.update({
        quantityReserved: newQuantityReserved,
        quantityAvailable: newQuantityAvailable
      });

      logger.info('Inventory reserved', {
        inventoryId: inventory.id,
        quantity: req.body.quantity,
        orderId: req.body.orderId,
        userId: req.user.id
      });

      res.json({
        success: true,
        inventory
      });
    } catch (error) {
      logger.error('Failed to reserve inventory', { error: error.message, inventoryId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to reserve inventory'
      });
    }
  }
);

// Release reserved inventory
router.post('/:id/release',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    quantity: Joi.number().integer().min(1).required(),
    orderId: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const inventory = await Inventory.findByPk(req.params.id);

      if (!inventory) {
        return res.status(404).json({
          success: false,
          error: 'Inventory item not found'
        });
      }

      if (inventory.quantityReserved < req.body.quantity) {
        return res.status(400).json({
          success: false,
          error: 'Cannot release more than reserved quantity',
          reserved: inventory.quantityReserved,
          requested: req.body.quantity
        });
      }

      const newQuantityReserved = inventory.quantityReserved - req.body.quantity;
      const newQuantityAvailable = inventory.quantityOnHand - newQuantityReserved;

      await inventory.update({
        quantityReserved: newQuantityReserved,
        quantityAvailable: newQuantityAvailable
      });

      logger.info('Inventory released', {
        inventoryId: inventory.id,
        quantity: req.body.quantity,
        orderId: req.body.orderId,
        userId: req.user.id
      });

      res.json({
        success: true,
        inventory
      });
    } catch (error) {
      logger.error('Failed to release inventory', { error: error.message, inventoryId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to release inventory'
      });
    }
  }
);

module.exports = router;
