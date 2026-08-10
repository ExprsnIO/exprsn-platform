const express = require('express');
const router = express.Router();
const { SalesOrder, Customer, Product } = require('../../../models/forge');
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
  discount: Joi.number().precision(2).min(0).optional(),
  tax: Joi.number().precision(2).min(0).optional(),
  total: Joi.number().precision(2).required()
});

const salesOrderCreateSchema = Joi.object({
  orderNumber: Joi.string().max(50).required(),
  customerId: Joi.string().uuid().required(),
  opportunityId: Joi.string().uuid().optional(),
  orderDate: Joi.date().iso().required(),
  requestedDeliveryDate: Joi.date().iso().optional(),
  expectedDeliveryDate: Joi.date().iso().optional(),
  status: Joi.string().valid('draft', 'pending_approval', 'approved', 'processing', 'shipped', 'delivered', 'completed', 'cancelled').optional(),
  fulfillmentStatus: Joi.string().valid('pending', 'partially_fulfilled', 'fulfilled', 'cancelled').optional(),
  subtotal: Joi.number().precision(2).min(0).required(),
  taxAmount: Joi.number().precision(2).min(0).optional(),
  shippingAmount: Joi.number().precision(2).min(0).optional(),
  discountAmount: Joi.number().precision(2).min(0).optional(),
  total: Joi.number().precision(2).required(),
  currency: Joi.string().length(3).optional(),
  lineItems: Joi.array().items(lineItemSchema).min(1).required(),
  shippingMethod: Joi.string().max(100).optional(),
  trackingNumber: Joi.string().max(255).optional(),
  shippingAddress: addressSchema.required(),
  billingAddress: addressSchema.required(),
  paymentMethod: Joi.string().max(100).optional(),
  paymentStatus: Joi.string().valid('pending', 'partially_paid', 'paid', 'refunded').optional(),
  paymentTerms: Joi.string().max(100).optional(),
  salesRepId: Joi.string().uuid().optional(),
  notes: Joi.string().optional(),
  customFields: Joi.object().optional(),
  metadata: Joi.object().optional()
});

const salesOrderUpdateSchema = salesOrderCreateSchema.fork(
  ['orderNumber', 'customerId', 'orderDate', 'subtotal', 'total', 'lineItems', 'shippingAddress', 'billingAddress'],
  (schema) => schema.optional()
);

// List sales orders
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    customerId: Joi.string().uuid().optional(),
    status: Joi.string().valid('draft', 'pending_approval', 'approved', 'processing', 'shipped', 'delivered', 'completed', 'cancelled').optional(),
    fulfillmentStatus: Joi.string().valid('pending', 'partially_fulfilled', 'fulfilled', 'cancelled').optional(),
    paymentStatus: Joi.string().valid('pending', 'partially_paid', 'paid', 'refunded').optional(),
    salesRepId: Joi.string().uuid().optional(),
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    search: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, customerId, status, fulfillmentStatus, paymentStatus, salesRepId, startDate, endDate, search, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      if (customerId) where.customerId = customerId;
      if (status) where.status = status;
      if (fulfillmentStatus) where.fulfillmentStatus = fulfillmentStatus;
      if (paymentStatus) where.paymentStatus = paymentStatus;
      if (salesRepId) where.salesRepId = salesRepId;

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
          { orderNumber: { [Op.iLike]: `%${search}%` } },
          { trackingNumber: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await SalesOrder.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['orderDate', 'DESC']],
        include: [
          {
            model: Customer,
            as: 'customer',
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
      logger.error('Failed to list sales orders', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list sales orders'
      });
    }
  }
);

// Get sales order by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const order = await SalesOrder.findByPk(req.params.id, {
        include: [
          {
            model: Customer,
            as: 'customer'
          }
        ]
      });

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Sales order not found'
        });
      }

      res.json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to get sales order', { error: error.message, orderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get sales order'
      });
    }
  }
);

// Get sales order statistics
router.get('/stats/overview',
  
  requirePermission('read'),
  validateQuery(Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    salesRepId: Joi.string().uuid().optional()
  })),
  async (req, res) => {
    try {
      const { startDate, endDate, salesRepId } = req.query;
      const { Op } = require('sequelize');
      const { sequelize } = require('../../../config/database');

      const where = {};
      if (salesRepId) where.salesRepId = salesRepId;
      if (startDate || endDate) {
        where.orderDate = {};
        if (startDate) where.orderDate[Op.gte] = new Date(startDate);
        if (endDate) where.orderDate[Op.lte] = new Date(endDate);
      }

      const [stats] = await sequelize.query(`
        SELECT
          COUNT(*) as "totalOrders",
          COUNT(*) FILTER (WHERE status = 'completed') as "completedOrders",
          COUNT(*) FILTER (WHERE status = 'cancelled') as "cancelledOrders",
          COUNT(*) FILTER (WHERE status IN ('draft', 'pending_approval', 'approved', 'processing')) as "pendingOrders",
          SUM(total) as "totalRevenue",
          SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END) as "completedRevenue",
          AVG(total) as "averageOrderValue",
          SUM(CASE WHEN fulfillment_status = 'fulfilled' THEN 1 ELSE 0 END) as "fulfilledOrders",
          SUM(CASE WHEN payment_status = 'paid' THEN 1 ELSE 0 END) as "paidOrders"
        FROM sales_orders
        WHERE 1=1
        ${salesRepId ? `AND sales_rep_id = '${salesRepId}'` : ''}
        ${startDate ? `AND order_date >= '${startDate}'` : ''}
        ${endDate ? `AND order_date <= '${endDate}'` : ''}
      `);

      res.json({
        success: true,
        stats: stats[0]
      });
    } catch (error) {
      logger.error('Failed to get sales order stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get sales order statistics'
      });
    }
  }
);

// Create sales order
router.post('/',
  
  requirePermission('write'),
  validateBody(salesOrderCreateSchema),
  async (req, res) => {
    try {
      // Verify customer exists
      const customer = await Customer.findByPk(req.body.customerId);
      if (!customer) {
        return res.status(404).json({
          success: false,
          error: 'Customer not found'
        });
      }

      // Verify products exist and have sufficient stock
      for (const item of req.body.lineItems) {
        const product = await Product.findByPk(item.productId);
        if (!product) {
          return res.status(404).json({
            success: false,
            error: `Product ${item.sku} not found`
          });
        }
      }

      const order = await SalesOrder.create({
        ...req.body,
        createdById: req.user.id
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('sales-order:created', { order });

      logger.info('Sales order created', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to create sales order', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message.includes('unique') ? 'An order with this order number already exists' : 'Failed to create sales order'
      });
    }
  }
);

// Update sales order
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(salesOrderUpdateSchema),
  async (req, res) => {
    try {
      const order = await SalesOrder.findByPk(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Sales order not found'
        });
      }

      // Prevent modification of completed or cancelled orders
      if (order.status === 'completed' || order.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: 'Cannot modify completed or cancelled orders'
        });
      }

      await order.update(req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('sales-order:updated', { order });

      logger.info('Sales order updated', {
        orderId: order.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to update sales order', { error: error.message, orderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update sales order'
      });
    }
  }
);

// Mark as fulfilled
router.post('/:id/fulfill',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    trackingNumber: Joi.string().max(255).optional(),
    shippingMethod: Joi.string().max(100).optional(),
    actualDeliveryDate: Joi.date().iso().optional(),
    notes: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const order = await SalesOrder.findByPk(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Sales order not found'
        });
      }

      if (order.status === 'cancelled') {
        return res.status(400).json({
          success: false,
          error: 'Cannot fulfill cancelled order'
        });
      }

      const updateData = {
        fulfillmentStatus: 'fulfilled',
        status: 'shipped',
        actualDeliveryDate: req.body.actualDeliveryDate || new Date()
      };

      if (req.body.trackingNumber) updateData.trackingNumber = req.body.trackingNumber;
      if (req.body.shippingMethod) updateData.shippingMethod = req.body.shippingMethod;
      if (req.body.notes) updateData.notes = `${order.notes || ''}\n${req.body.notes}`;

      await order.update(updateData);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('sales-order:fulfilled', { order });

      logger.info('Sales order fulfilled', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        userId: req.user.id
      });

      res.json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to fulfill sales order', { error: error.message, orderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to fulfill sales order'
      });
    }
  }
);

// Cancel sales order
router.post('/:id/cancel',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    reason: Joi.string().max(500).required()
  })),
  async (req, res) => {
    try {
      const order = await SalesOrder.findByPk(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Sales order not found'
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
        fulfillmentStatus: 'cancelled',
        notes: `${order.notes || ''}\nCancelled: ${req.body.reason}`
      });

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('sales-order:cancelled', { order });

      logger.info('Sales order cancelled', {
        orderId: order.id,
        orderNumber: order.orderNumber,
        reason: req.body.reason,
        userId: req.user.id
      });

      res.json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to cancel sales order', { error: error.message, orderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to cancel sales order'
      });
    }
  }
);

// Update payment status
router.post('/:id/payment',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    paymentStatus: Joi.string().valid('pending', 'partially_paid', 'paid', 'refunded').required(),
    paymentMethod: Joi.string().max(100).optional(),
    notes: Joi.string().optional()
  })),
  async (req, res) => {
    try {
      const order = await SalesOrder.findByPk(req.params.id);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Sales order not found'
        });
      }

      const updateData = {
        paymentStatus: req.body.paymentStatus
      };

      if (req.body.paymentMethod) updateData.paymentMethod = req.body.paymentMethod;
      if (req.body.notes) updateData.notes = `${order.notes || ''}\n${req.body.notes}`;

      await order.update(updateData);

      logger.info('Sales order payment updated', {
        orderId: order.id,
        paymentStatus: req.body.paymentStatus,
        userId: req.user.id
      });

      res.json({
        success: true,
        order
      });
    } catch (error) {
      logger.error('Failed to update payment status', { error: error.message, orderId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update payment status'
      });
    }
  }
);

module.exports = router;
