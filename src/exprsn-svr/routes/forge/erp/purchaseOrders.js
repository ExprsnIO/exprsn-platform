const express = require('express');
const router = express.Router();
const { PurchaseOrder, Supplier, Product } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const logger = require('../../../utils/logger');

// Validation schemas
const addressSchema = Joi.object({
  line1: Joi.string().max(255).required(),
  line2: Joi.string().max(255).optional(),
  city: Joi.string().max(100).required(),
  state: Joi.string().max(100).optional(),
  postalCode: Joi.string().max(20).required(),
  country: Joi.string().max(100).required()
});

const lineItemSchema = Joi.object({
  productId: Joi.string().uuid().required(),
  sku: Joi.string().max(100).required(),
  name: Joi.string().max(255).required(),
  quantity: Joi.number().integer().min(1).required(),
  unitPrice: Joi.number().precision(2).positive().required(),
  quantityReceived: Joi.number().integer().min(0).optional(),
  receivedDate: Joi.date().iso().optional()
});

const purchaseOrderCreateSchema = Joi.object({
  poNumber: Joi.string().max(50).required(),
  supplierId: Joi.string().uuid().required(),
  orderDate: Joi.date().iso().required(),
  requestedDeliveryDate: Joi.date().iso().optional(),
  expectedDeliveryDate: Joi.date().iso().optional(),
  status: Joi.string().valid('draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'received', 'completed', 'cancelled').optional(),
  approvalStatus: Joi.string().valid('pending', 'approved', 'rejected').optional(),
  subtotal: Joi.number().precision(2).min(0).required(),
  taxAmount: Joi.number().precision(2).min(0).optional(),
  shippingAmount: Joi.number().precision(2).min(0).optional(),
  discountAmount: Joi.number().precision(2).min(0).optional(),
  total: Joi.number().precision(2).required(),
  currency: Joi.string().length(3).optional(),
  lineItems: Joi.array().items(lineItemSchema).min(1).required(),
  deliveryAddress: addressSchema.required(),
  deliveryInstructions: Joi.string().optional(),
  paymentTerms: Joi.string().max(100).optional(),
  paymentMethod: Joi.string().max(100).optional(),
  paymentStatus: Joi.string().valid('pending', 'partially_paid', 'paid').optional(),
  buyerId: Joi.string().uuid().required(),
  departmentId: Joi.string().uuid().optional(),
  approvalChain: Joi.array().optional(),
  notes: Joi.string().optional(),
  customFields: Joi.object().optional(),
  metadata: Joi.object().optional()
});

const purchaseOrderUpdateSchema = purchaseOrderCreateSchema.fork(
  ['poNumber', 'supplierId', 'orderDate', 'subtotal', 'total', 'lineItems', 'deliveryAddress', 'buyerId'],
  (schema) => schema.optional()
);

// List purchase orders
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    supplierId: Joi.string().uuid().optional(),
    status: Joi.string().valid('draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'received', 'completed', 'cancelled').optional(),
    approvalStatus: Joi.string().valid('pending', 'approved', 'rejected').optional(),
    paymentStatus: Joi.string().valid('pending', 'partially_paid', 'paid').optional(),
    buyerId: Joi.string().uuid().optional(),
    departmentId: Joi.string().uuid().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    search: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, supplierId, status, approvalStatus, paymentStatus, buyerId, departmentId, startDate, endDate, search, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      if (supplierId) where.supplierId = supplierId;
      if (status) where.status = status;
      if (approvalStatus) where.approvalStatus = approvalStatus;
      if (paymentStatus) where.paymentStatus = paymentStatus;
      if (buyerId) where.buyerId = buyerId;
      if (departmentId) where.departmentId = departmentId;

      // Date range filter
      if (startDate || endDate) {
        const { Op } = require('sequelize');
        where.orderDate = {};
        if (startDate) where.orderDate[Op.gte] = new Date(startDate);
        if (endDate) where.orderDate[Op.lte] = new Date(endDate);
      }

      // Search functionality
      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { poNumber: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await PurchaseOrder.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['orderDate', 'DESC']],
        include: [
          {
            model: Supplier,
            as: 'supplier',
            attributes: ['id', 'name', 'email', 'phone']
          }
        ]
      });

      res.json({
        success: true,
        orders: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list purchase orders', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list purchase orders'
      });
    }
  }
);

// Get purchase order by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const order = await PurchaseOrder.findByPk(req.params.id, {
        include: [
          {
            model: Supplier,
            as: 'supplier'
          }
        ]
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Purchase order not found'
        });
      }

      res.json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to get purchase order', { error: error.message, orderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get purchase order'
      });
    }
  }
);

// Get pending approvals for current user
router.get('/approvals/pending',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    limit: Joi.number().integer().min(1).max(100).optional().default(50)
  })),
  async (req, res) => {
    try {
      const { limit } = req.query;

      // Find orders where current user is in approval chain and approval is pending
      const orders = await PurchaseOrder.findAll({
        where: {
          approvalStatus: 'pending'
        },
        limit,
        order: [['orderDate', 'DESC']],
        include: [
          {
            model: Supplier,
            as: 'supplier',
            attributes: ['id', 'name', 'email']
          }
        ]
      });

      // Filter orders where current user needs to approve
      const pendingForUser = orders.filter(order => {
        if (!order.approvalChain) return false;
        const currentLevel = order.currentApprovalLevel || 0;
        const approvers = order.approvalChain.filter(a => a.level === currentLevel);
        return approvers.some(a => a.userId === req.user.id && !a.status);
      });

      res.json({
        success: true,
        orders: pendingForUser,
        count: pendingForUser.length
      });
    } catch (error) {
      logger.error('Failed to get pending approvals', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get pending approvals'
      });
    }
  }
);

// Create purchase order
router.post('/',
  
  requirePermission('write'),
  validateBody(purchaseOrderCreateSchema),
  async (req, res) => {
    try {
      // Verify supplier exists
      const supplier = await Supplier.findByPk(req.body.supplierId);
      if (!supplier) {
        return res.status(404).json({
          success: false,
          error: 'Supplier not found'
        });
      }

      // Verify products exist
      for (const item of req.body.lineItems) {
        const product = await Product.findByPk(item.productId);
        if (!product) {
          return res.status(404).json({
            success: false,
            error: `Product ${item.sku} not found`
          });
        }
      }

      const order = await PurchaseOrder.create({
        ...req.body,
        createdById: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('purchase-order:created', { order });

      logger.info('Purchase order created', {
        orderId: order.id,
        poNumber: order.poNumber,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to create purchase order', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message.includes('unique') ? 'A purchase order with this PO number already exists' : 'Failed to create purchase order'
      });
    }
  }
);

// Update purchase order
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(purchaseOrderUpdateSchema),
  async (req, res) => {
    try {
      const order = await PurchaseOrder.findByPk(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Purchase order not found'
        });
      }

      // Prevent modification of completed or cancelled orders
      if (order.status === 'completed' || order.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: 'Cannot modify completed or cancelled orders'
        });
      }

      // Prevent modification of approved orders without special permission
      if (order.approvalStatus === 'approved' && order.status !== 'draft') {
        return res.status(400).json({
          success: false,
          error: 'Cannot modify approved orders'
        });
      }

      await order.update(req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('purchase-order:updated', { order });

      logger.info('Purchase order updated', {
        orderId: order.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to update purchase order', { error: error.message, orderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update purchase order'
      });
    }
  }
);

// Approve/reject purchase order
router.post('/:id/approve',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    action: Joi.string().valid('approve', 'reject').required(),
    comments: Joi.string().max(500).optional()
  })),
  async (req, res) => {
    try {
      const order = await PurchaseOrder.findByPk(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Purchase order not found'
        });
      }

      if (order.approvalStatus !== 'pending') {
        return res.status(400).json({
          success: false,
          error: 'Order is not pending approval'
        });
      }

      // Check if current user is in approval chain
      const currentLevel = order.currentApprovalLevel || 0;
      const approvalChain = order.approvalChain || [];
      const userApproval = approvalChain.find(
        a => a.level === currentLevel && a.userId === req.user.id
      );

      if (!userApproval) {
        return res.status(403).json({
          success: false,
          error: 'You are not authorized to approve this order at this level'
        });
      }

      // Update approval chain
      userApproval.status = req.body.action === 'approve' ? 'approved' : 'rejected';
      userApproval.approvedAt = new Date();
      userApproval.comments = req.body.comments;

      let updateData = {
        approvalChain
      };

      if (req.body.action === 'reject') {
        updateData.approvalStatus = 'rejected';
        updateData.status = 'cancelled';
      } else {
        // Check if there are more levels
        const nextLevel = currentLevel + 1;
        const hasNextLevel = approvalChain.some(a => a.level === nextLevel);

        if (hasNextLevel) {
          updateData.currentApprovalLevel = nextLevel;
        } else {
          // All levels approved
          updateData.approvalStatus = 'approved';
          updateData.status = 'approved';
          updateData.approvedById = req.user.id;
          updateData.approvedAt = new Date();
        }
      }

      await order.update(updateData);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('purchase-order:approval-updated', { order, action: req.body.action });

      logger.info('Purchase order approval updated', {
        orderId: order.id,
        action: req.body.action,
        userId: req.user.id
      });

      res.json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to update approval status', { error: error.message, orderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update approval status'
      });
    }
  }
);

// Receive goods
router.post('/:id/receive',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    lineItems: Joi.array().items(Joi.object({
      productId: Joi.string().uuid().required(),
      quantityReceived: Joi.number().integer().min(1).required()
    })).min(1).required(),
    actualDeliveryDate: Joi.date().iso().optional(),
    notes: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const order = await PurchaseOrder.findByPk(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Purchase order not found'
        });
      }

      if (order.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: 'Cannot receive goods for cancelled order'
        });
      }

      if (order.approvalStatus !== 'approved') {
        return res.status(400).json({
          success: false,
          error: 'Order must be approved before receiving goods'
        });
      }

      // Update line items with received quantities
      const updatedLineItems = order.lineItems.map(item => {
        const receivedItem = req.body.lineItems.find(r => r.productId === item.productId);
        if (receivedItem) {
          return {
            ...item,
            quantityReceived: (item.quantityReceived || 0) + receivedItem.quantityReceived,
            receivedDate: new Date()
          };
        }
        return item;
      });

      // Check if all items fully received
      const fullyReceived = updatedLineItems.every(
        item => (item.quantityReceived || 0) >= item.quantity
      );

      const updateData = {
        lineItems: updatedLineItems,
        status: fullyReceived ? 'received' : 'partially_received',
        actualDeliveryDate: req.body.actualDeliveryDate || new Date()
      };

      if (req.body.notes) {
        updateData.notes = `${order.notes || ''}\n${req.body.notes}`;
      }

      await order.update(updateData);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('purchase-order:goods-received', { order });

      logger.info('Purchase order goods received', {
        orderId: order.id,
        poNumber: order.poNumber,
        fullyReceived,
        userId: req.user.id
      });

      res.json({
        success: true,
        order,
        fullyReceived
      });
    } catch (error) {
      logger.error('Failed to receive goods', { error: error.message, orderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to receive goods'
      });
    }
  }
);

// Cancel purchase order
router.post('/:id/cancel',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    reason: Joi.string().max(500).required()
  })),
  async (req, res) => {
    try {
      const order = await PurchaseOrder.findByPk(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Purchase order not found'
        });
      }

      if (order.status === 'completed') {
        return res.status(400).json({
          success: false,
          error: 'Cannot cancel completed order'
        });
      }

      await order.update({
        status: 'cancelled',
        approvalStatus: 'rejected',
        notes: `${order.notes || ''}\nCancelled: ${req.body.reason}`
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('purchase-order:cancelled', { order });

      logger.info('Purchase order cancelled', {
        orderId: order.id,
        poNumber: order.poNumber,
        reason: req.body.reason,
        userId: req.user.id
      });

      res.json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to cancel purchase order', { error: error.message, orderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to cancel purchase order'
      });
    }
  }
);

module.exports = router;
