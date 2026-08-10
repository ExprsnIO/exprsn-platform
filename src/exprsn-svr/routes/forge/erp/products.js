const express = require('express');
const router = express.Router();
const { Product } = require('../../../models/forge');
const { requirePermission } = require('../../../middleware/auth');
const { validateBody, validateQuery, validateParams, schemas } = require('../../../middleware/validation');
const Joi = require('joi');
const logger = require('../../../utils/logger');

// Validation schemas
const productCreateSchema = Joi.object({
  sku: Joi.string().max(100).required(),
  name: Joi.string().max(255).required(),
  description: Joi.string().optional(),
  category: Joi.string().max(100).optional(),
  type: Joi.string().valid('product', 'service').optional(),
  status: Joi.string().valid('active', 'inactive', 'discontinued').optional(),
  unitPrice: Joi.number().precision(2).positive().required(),
  costPrice: Joi.number().precision(2).positive().optional(),
  currency: Joi.string().length(3).optional(),
  taxable: Joi.boolean().optional(),
  stockQuantity: Joi.number().integer().min(0).optional(),
  reorderPoint: Joi.number().integer().min(0).optional(),
  unit: Joi.string().max(50).optional(),
  barcode: Joi.string().max(100).optional(),
  metadata: Joi.object().optional()
});

const productUpdateSchema = productCreateSchema.fork(
  ['sku', 'name', 'unitPrice'],
  (schema) => schema.optional()
);

// List products
router.get('/',
  
  requirePermission('read'),
  validateQuery(schemas.pagination.keys({
    search: Joi.string().optional(),
    category: Joi.string().optional(),
    type: Joi.string().valid('product', 'service').optional(),
    status: Joi.string().valid('active', 'inactive', 'discontinued').optional(),
    lowStock: Joi.boolean().optional()
  })),
  async (req, res) => {
    try {
      const { page, limit, search, category, type, status, lowStock, sortBy, sortOrder } = req.query;
      const offset = (page - 1) * limit;

      const where = {};

      if (category) where.category = category;
      if (type) where.type = type;
      if (status) where.status = status;

      // Low stock filter
      if (lowStock === 'true') {
        const { Op } = require('sequelize');
        where.stockQuantity = { [Op.lte]: sequelize.col('reorderPoint') };
      }

      // Search functionality
      if (search) {
        const { Op } = require('sequelize');
        where[Op.or] = [
          { name: { [Op.iLike]: `%${search}%` } },
          { sku: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } },
          { barcode: { [Op.iLike]: `%${search}%` } }
        ];
      }

      const { count, rows } = await Product.findAndCountAll({
        where,
        limit,
        offset,
        order: sortBy ? [[sortBy, sortOrder]] : [['name', 'ASC']]
      });

      res.json({
        success: true,
        products: rows,
        pagination: {
          total: count,
          page,
          limit,
          pages: Math.ceil(count / limit)
        }
      });
    } catch (error) {
      logger.error('Failed to list products', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to list products'
      });
    }
  }
);

// Get product by ID
router.get('/:id',
  
  requirePermission('read'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const product = await Product.findByPk(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      res.json({
        success: true,
        product
      });
    } catch (error) {
      logger.error('Failed to get product', { error: error.message, productId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to get product'
      });
    }
  }
);

// Get product by SKU
router.get('/sku/:sku',
  
  requirePermission('read'),
  validateParams(Joi.object({
    sku: Joi.string().max(100).required()
  })),
  async (req, res) => {
    try {
      const product = await Product.findOne({
        where: { sku: req.params.sku }
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      res.json({
        success: true,
        product
      });
    } catch (error) {
      logger.error('Failed to get product by SKU', { error: error.message, sku: req.params.sku });
      res.status(500).json({
        success: false,
        error: 'Failed to get product'
      });
    }
  }
);

// Get product statistics
router.get('/stats/overview',
  
  requirePermission('read'),
  async (req, res) => {
    try {
      const { Op } = require('sequelize');
      const { sequelize } = require('../../../config/database');

      const [stats] = await sequelize.query(`
        SELECT
          COUNT(*) as "totalProducts",
          COUNT(*) FILTER (WHERE status = 'active') as "activeProducts",
          COUNT(*) FILTER (WHERE status = 'inactive') as "inactiveProducts",
          COUNT(*) FILTER (WHERE status = 'discontinued') as "discontinuedProducts",
          COUNT(*) FILTER (WHERE type = 'product') as "physicalProducts",
          COUNT(*) FILTER (WHERE type = 'service') as "services",
          COUNT(*) FILTER (WHERE stock_quantity <= reorder_point AND reorder_point IS NOT NULL) as "lowStockProducts",
          SUM(stock_quantity * unit_price) as "totalInventoryValue",
          AVG(unit_price) as "averagePrice"
        FROM products
      `);

      const categoryCounts = await Product.findAll({
        attributes: [
          'category',
          [sequelize.fn('COUNT', sequelize.col('id')), 'count']
        ],
        group: ['category'],
        order: [[sequelize.fn('COUNT', sequelize.col('id')), 'DESC']],
        limit: 10
      });

      res.json({
        success: true,
        stats: stats[0],
        topCategories: categoryCounts
      });
    } catch (error) {
      logger.error('Failed to get product stats', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to get product statistics'
      });
    }
  }
);

// Create product
router.post('/',
  
  requirePermission('write'),
  validateBody(productCreateSchema),
  async (req, res) => {
    try {
      const product = await Product.create(req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('product:created', { product });

      logger.info('Product created', {
        productId: product.id,
        sku: product.sku,
        userId: req.user.id
      });

      res.status(201).json({
        success: true,
        product
      });
    } catch (error) {
      logger.error('Failed to create product', { error: error.message });
      res.status(500).json({
        success: false,
        error: error.message.includes('unique') ? 'A product with this SKU already exists' : 'Failed to create product'
      });
    }
  }
);

// Update product
router.put('/:id',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(productUpdateSchema),
  async (req, res) => {
    try {
      const product = await Product.findByPk(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      await product.update(req.body);

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('product:updated', { product });

      logger.info('Product updated', {
        productId: product.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        product
      });
    } catch (error) {
      logger.error('Failed to update product', { error: error.message, productId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to update product'
      });
    }
  }
);

// Delete product
router.delete('/:id',
  
  requirePermission('delete'),
  validateParams(schemas.id),
  async (req, res) => {
    try {
      const product = await Product.findByPk(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      // Check if product is used in any orders or inventory
      const { Inventory, SalesOrder, PurchaseOrder } = require('../../../models/forge');

      const inventoryCount = await Inventory.count({
        where: { productId: product.id }
      });

      if (inventoryCount > 0) {
        return res.status(400).json({
          success: false,
          error: 'Cannot delete product with existing inventory records. Consider marking as discontinued instead.'
        });
      }

      await product.destroy();

      // Emit Socket.IO event
      const io = req.app.get('io');
      io.emit('product:deleted', { productId: product.id });

      logger.info('Product deleted', {
        productId: product.id,
        userId: req.user.id
      });

      res.json({
        success: true,
        message: 'Product deleted successfully'
      });
    } catch (error) {
      logger.error('Failed to delete product', { error: error.message, productId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to delete product'
      });
    }
  }
);

// Bulk import products
router.post('/import',
  
  requirePermission('write'),
  validateBody(Joi.object({
    products: Joi.array().items(productCreateSchema).min(1).required(),
    options: Joi.object({
      updateExisting: Joi.boolean().default(false),
      skipDuplicates: Joi.boolean().default(true)
    }).optional()
  })),
  async (req, res) => {
    try {
      const { products, options = {} } = req.body;
      const results = {
        created: 0,
        updated: 0,
        skipped: 0,
        errors: []
      };

      for (const productData of products) {
        try {
          const existingProduct = await Product.findOne({
            where: { sku: productData.sku }
          });

          if (existingProduct) {
            if (options.updateExisting) {
              await existingProduct.update(productData);
              results.updated++;
            } else if (options.skipDuplicates) {
              results.skipped++;
            } else {
              results.errors.push({
                sku: productData.sku,
                error: 'Product already exists'
              });
            }
          } else {
            await Product.create(productData);
            results.created++;
          }
        } catch (error) {
          results.errors.push({
            sku: productData.sku,
            error: error.message
          });
        }
      }

      logger.info('Bulk product import completed', {
        ...results,
        userId: req.user.id
      });

      res.json({
        success: true,
        results
      });
    } catch (error) {
      logger.error('Failed to import products', { error: error.message });
      res.status(500).json({
        success: false,
        error: 'Failed to import products'
      });
    }
  }
);

// Adjust stock quantity
router.post('/:id/adjust-stock',
  
  requirePermission('update'),
  validateParams(schemas.id),
  validateBody(Joi.object({
    adjustment: Joi.number().integer().required(),
    reason: Joi.string().max(500).optional()
  })),
  async (req, res) => {
    try {
      const product = await Product.findByPk(req.params.id);

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Product not found'
        });
      }

      const newQuantity = (product.stockQuantity || 0) + req.body.adjustment;

      if (newQuantity < 0) {
        return res.status(400).json({
          success: false,
          error: 'Adjustment would result in negative stock'
        });
      }

      await product.update({ stockQuantity: newQuantity });

      logger.info('Product stock adjusted', {
        productId: product.id,
        adjustment: req.body.adjustment,
        newQuantity,
        reason: req.body.reason,
        userId: req.user.id
      });

      res.json({
        success: true,
        product,
        previousQuantity: product.stockQuantity - req.body.adjustment,
        newQuantity
      });
    } catch (error) {
      logger.error('Failed to adjust stock', { error: error.message, productId: req.params.id });
      res.status(500).json({
        success: false,
        error: 'Failed to adjust stock'
      });
    }
  }
);

module.exports = router;
