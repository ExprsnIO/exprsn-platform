const { Op } = require('sequelize');
const { SalesOrder, Customer, Product, Invoice } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');
const inventoryService = require('./inventoryService');
const workflowService = require('../workflowIntegrationService');

/**
 * Sales Service
 *
 * Handles sales orders, order fulfillment, shipping, and customer order management
 */

/**
 * Create sales order
 */
async function createSalesOrder({
  customerId,
  opportunityId,
  lineItems,
  orderDate = new Date(),
  requestedDeliveryDate,
  shippingAddress,
  billingAddress,
  shippingMethod,
  paymentMethod,
  notes,
  userId
}) {
  const transaction = await sequelize.transaction();

  try {
    // Validate customer
    const customer = await Customer.findByPk(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Validate products and calculate totals
    let subtotal = 0;
    const validatedLineItems = [];

    for (const item of lineItems) {
      const product = await Product.findByPk(item.productId);
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }

      const lineTotal = item.quantity * item.unitPrice;
      const lineDiscount = item.discount || 0;
      const lineTax = ((lineTotal - lineDiscount) * (item.taxRate || 0)) / 100;

      validatedLineItems.push({
        productId: item.productId,
        sku: product.sku,
        name: product.name,
        description: item.description || product.description,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        discount: lineDiscount,
        taxRate: item.taxRate || 0,
        tax: lineTax,
        total: lineTotal - lineDiscount + lineTax,
        fulfillmentStatus: 'pending',
        quantityFulfilled: 0
      });

      subtotal += lineTotal;
    }

    // Calculate totals
    const discountAmount = lineItems.reduce((sum, item) => sum + (item.discount || 0), 0);
    const taxAmount = validatedLineItems.reduce((sum, item) => sum + item.tax, 0);
    const shippingAmount = calculateShippingCost(shippingMethod, validatedLineItems);
    const total = subtotal - discountAmount + taxAmount + shippingAmount;

    // Generate order number
    const orderNumber = await generateOrderNumber();

    // Create sales order
    const salesOrder = await SalesOrder.create({
      orderNumber,
      customerId,
      opportunityId,
      orderDate,
      requestedDeliveryDate,
      status: 'draft',
      fulfillmentStatus: 'pending',
      subtotal,
      taxAmount,
      shippingAmount,
      discountAmount,
      total,
      currency: customer.currency || 'USD',
      lineItems: validatedLineItems,
      shippingAddress,
      billingAddress,
      shippingMethod,
      paymentMethod,
      notes,
      createdById: userId
    }, { transaction });

    await transaction.commit();

    // Trigger sales order created workflow
    const customer = await Customer.findByPk(customerId);
    await workflowService.triggerSalesApprovalWorkflow({
      ...salesOrder.toJSON(),
      customer
    }, userId);

    logger.info('Sales order created', {
      salesOrderId: salesOrder.id,
      orderNumber,
      customerId,
      total,
      userId
    });

    return salesOrder;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to create sales order', {
      error: error.message,
      customerId
    });
    throw error;
  }
}

/**
 * Update sales order
 */
async function updateSalesOrder(salesOrderId, updates, userId) {
  const transaction = await sequelize.transaction();

  try {
    const salesOrder = await SalesOrder.findByPk(salesOrderId, { transaction });

    if (!salesOrder) {
      throw new Error('Sales order not found');
    }

    // Cannot update if already shipped or completed
    if (['shipped', 'delivered', 'completed', 'cancelled'].includes(salesOrder.status)) {
      throw new Error(`Cannot update sales order with status: ${salesOrder.status}`);
    }

    // If line items are updated, recalculate totals
    if (updates.lineItems) {
      const newLineItems = updates.lineItems;

      // Recalculate totals
      const subtotal = newLineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const discountAmount = newLineItems.reduce((sum, item) => sum + (item.discount || 0), 0);
      const taxAmount = newLineItems.reduce((sum, item) => sum + (item.tax || 0), 0);
      const shippingAmount = calculateShippingCost(updates.shippingMethod || salesOrder.shippingMethod, newLineItems);
      const total = subtotal - discountAmount + taxAmount + shippingAmount;

      updates.subtotal = subtotal;
      updates.discountAmount = discountAmount;
      updates.taxAmount = taxAmount;
      updates.shippingAmount = shippingAmount;
      updates.total = total;
    }

    updates.lastModifiedById = userId;
    updates.lastModifiedAt = new Date();

    await salesOrder.update(updates, { transaction });

    await transaction.commit();

    logger.info('Sales order updated', {
      salesOrderId,
      userId
    });

    return salesOrder;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to update sales order', {
      error: error.message,
      salesOrderId
    });
    throw error;
  }
}

/**
 * Approve sales order
 */
async function approveSalesOrder(salesOrderId, userId) {
  const transaction = await sequelize.transaction();

  try {
    const salesOrder = await SalesOrder.findByPk(salesOrderId, { transaction });

    if (!salesOrder) {
      throw new Error('Sales order not found');
    }

    if (salesOrder.status !== 'draft' && salesOrder.status !== 'pending_approval') {
      throw new Error('Only draft or pending sales orders can be approved');
    }

    await salesOrder.update({
      status: 'approved',
      approvedById: userId,
      approvedAt: new Date()
    }, { transaction });

    // Reserve inventory for all line items
    for (const lineItem of salesOrder.lineItems) {
      const locationId = lineItem.fulfillmentLocationId || salesOrder.fulfillmentLocationId;

      if (locationId) {
        try {
          await inventoryService.reserveStock(
            lineItem.productId,
            locationId,
            lineItem.quantity,
            salesOrderId
          );
        } catch (error) {
          logger.warn('Failed to reserve stock for line item', {
            salesOrderId,
            productId: lineItem.productId,
            error: error.message
          });
          // Continue with approval but log the issue
        }
      }
    }

    await transaction.commit();

    logger.info('Sales order approved', {
      salesOrderId,
      userId
    });

    return salesOrder;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to approve sales order', {
      error: error.message,
      salesOrderId
    });
    throw error;
  }
}

/**
 * Fulfill order (pick, pack, ship)
 */
async function fulfillOrder({
  salesOrderId,
  fulfillmentItems,
  locationId,
  trackingNumber,
  carrier,
  shippedDate = new Date(),
  userId,
  notes
}) {
  const transaction = await sequelize.transaction();

  try {
    const salesOrder = await SalesOrder.findByPk(salesOrderId, { transaction });

    if (!salesOrder) {
      throw new Error('Sales order not found');
    }

    if (salesOrder.status !== 'approved' && salesOrder.status !== 'processing') {
      throw new Error('Sales order must be approved before fulfillment');
    }

    const lineItems = salesOrder.lineItems;
    const fulfillmentRecords = salesOrder.fulfillmentRecords || [];

    // Process each fulfilled item
    for (const fulfillmentItem of fulfillmentItems) {
      const lineItem = lineItems.find(li => li.productId === fulfillmentItem.productId);

      if (!lineItem) {
        throw new Error(`Product ${fulfillmentItem.productId} not found in sales order`);
      }

      // Calculate total fulfilled so far
      const previouslyFulfilled = lineItem.quantityFulfilled || 0;
      const totalFulfilled = previouslyFulfilled + fulfillmentItem.quantity;

      if (totalFulfilled > lineItem.quantity) {
        throw new Error(`Cannot fulfill more than ordered quantity for ${lineItem.name}`);
      }

      // Ship from inventory
      await inventoryService.shipStock({
        productId: fulfillmentItem.productId,
        locationId: fulfillmentItem.locationId || locationId,
        quantity: fulfillmentItem.quantity,
        referenceType: 'sales_order',
        referenceId: salesOrderId,
        referenceNumber: salesOrder.orderNumber,
        serialNumbers: fulfillmentItem.serialNumbers,
        lotNumber: fulfillmentItem.lotNumber,
        binLocation: fulfillmentItem.binLocation,
        userId,
        notes
      });

      // Update line item fulfillment status
      lineItem.quantityFulfilled = totalFulfilled;
      lineItem.fulfillmentStatus = totalFulfilled >= lineItem.quantity ? 'fulfilled' : 'partially_fulfilled';

      // Record fulfillment
      fulfillmentRecords.push({
        productId: fulfillmentItem.productId,
        quantity: fulfillmentItem.quantity,
        fulfilledDate: shippedDate,
        fulfilledById: userId,
        locationId: fulfillmentItem.locationId || locationId,
        serialNumbers: fulfillmentItem.serialNumbers,
        lotNumber: fulfillmentItem.lotNumber,
        trackingNumber,
        carrier,
        notes: fulfillmentItem.notes
      });
    }

    // Determine overall fulfillment status
    const allItemsFulfilled = lineItems.every(li => {
      const qtyFulfilled = li.quantityFulfilled || 0;
      return qtyFulfilled >= li.quantity;
    });

    const someItemsFulfilled = lineItems.some(li => {
      const qtyFulfilled = li.quantityFulfilled || 0;
      return qtyFulfilled > 0;
    });

    let newFulfillmentStatus = 'pending';
    let newStatus = salesOrder.status;

    if (allItemsFulfilled) {
      newFulfillmentStatus = 'fulfilled';
      newStatus = 'shipped';
    } else if (someItemsFulfilled) {
      newFulfillmentStatus = 'partially_fulfilled';
      newStatus = 'processing';
    }

    await salesOrder.update({
      status: newStatus,
      fulfillmentStatus: newFulfillmentStatus,
      lineItems,
      fulfillmentRecords,
      trackingNumber,
      carrier,
      actualShippingDate: allItemsFulfilled ? shippedDate : salesOrder.actualShippingDate
    }, { transaction });

    await transaction.commit();

    logger.info('Order fulfilled', {
      salesOrderId,
      itemsFulfilled: fulfillmentItems.length,
      fullyFulfilled: allItemsFulfilled,
      userId
    });

    // Send shipping notification to customer and trigger workflow
    if (allItemsFulfilled) {
      await sendShippingNotification(salesOrder);
      await workflowService.triggerSalesShippedWorkflow(salesOrder, userId);
    }

    return salesOrder;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to fulfill order', {
      error: error.message,
      salesOrderId
    });
    throw error;
  }
}

/**
 * Mark order as delivered
 */
async function markAsDelivered(salesOrderId, deliveredDate, userId) {
  try {
    const salesOrder = await SalesOrder.findByPk(salesOrderId);

    if (!salesOrder) {
      throw new Error('Sales order not found');
    }

    if (salesOrder.status !== 'shipped') {
      throw new Error('Only shipped orders can be marked as delivered');
    }

    await salesOrder.update({
      status: 'delivered',
      actualDeliveryDate: deliveredDate,
      deliveredById: userId
    });

    logger.info('Order marked as delivered', {
      salesOrderId,
      userId
    });

    // Send delivery confirmation to customer
    await sendDeliveryConfirmation(salesOrder);

    return salesOrder;
  } catch (error) {
    logger.error('Failed to mark order as delivered', {
      error: error.message,
      salesOrderId
    });
    throw error;
  }
}

/**
 * Complete sales order
 */
async function completeSalesOrder(salesOrderId, userId) {
  try {
    const salesOrder = await SalesOrder.findByPk(salesOrderId);

    if (!salesOrder) {
      throw new Error('Sales order not found');
    }

    if (salesOrder.status !== 'delivered') {
      throw new Error('Order must be delivered before completion');
    }

    await salesOrder.update({
      status: 'completed',
      completedAt: new Date(),
      completedById: userId
    });

    logger.info('Sales order completed', {
      salesOrderId,
      userId
    });

    return salesOrder;
  } catch (error) {
    logger.error('Failed to complete sales order', {
      error: error.message,
      salesOrderId
    });
    throw error;
  }
}

/**
 * Cancel sales order
 */
async function cancelSalesOrder(salesOrderId, userId, reason) {
  const transaction = await sequelize.transaction();

  try {
    const salesOrder = await SalesOrder.findByPk(salesOrderId, { transaction });

    if (!salesOrder) {
      throw new Error('Sales order not found');
    }

    if (['completed', 'cancelled'].includes(salesOrder.status)) {
      throw new Error(`Cannot cancel sales order with status: ${salesOrder.status}`);
    }

    // Release reserved inventory
    for (const lineItem of salesOrder.lineItems) {
      const locationId = lineItem.fulfillmentLocationId || salesOrder.fulfillmentLocationId;

      if (locationId) {
        const quantityToRelease = lineItem.quantity - (lineItem.quantityFulfilled || 0);
        if (quantityToRelease > 0) {
          try {
            await inventoryService.releaseReservedStock(
              lineItem.productId,
              locationId,
              quantityToRelease
            );
          } catch (error) {
            logger.warn('Failed to release reserved stock', {
              salesOrderId,
              productId: lineItem.productId,
              error: error.message
            });
          }
        }
      }
    }

    await salesOrder.update({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledById: userId,
      cancellationReason: reason
    }, { transaction });

    await transaction.commit();

    logger.info('Sales order cancelled', {
      salesOrderId,
      userId,
      reason
    });

    return salesOrder;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to cancel sales order', {
      error: error.message,
      salesOrderId
    });
    throw error;
  }
}

/**
 * Process return/RMA
 */
async function processReturn({
  salesOrderId,
  returnItems,
  locationId,
  returnReason,
  refundAmount,
  restockItems = true,
  userId,
  notes
}) {
  const transaction = await sequelize.transaction();

  try {
    const salesOrder = await SalesOrder.findByPk(salesOrderId, { transaction });

    if (!salesOrder) {
      throw new Error('Sales order not found');
    }

    const returnRecords = salesOrder.returnRecords || [];

    // Process each returned item
    for (const returnItem of returnItems) {
      const lineItem = salesOrder.lineItems.find(li => li.productId === returnItem.productId);

      if (!lineItem) {
        throw new Error(`Product ${returnItem.productId} not found in sales order`);
      }

      // If restocking, receive back into inventory
      if (restockItems) {
        await inventoryService.receiveStock({
          productId: returnItem.productId,
          locationId,
          quantity: returnItem.quantity,
          referenceType: 'return',
          referenceId: salesOrderId,
          referenceNumber: salesOrder.orderNumber,
          serialNumbers: returnItem.serialNumbers,
          lotNumber: returnItem.lotNumber,
          userId,
          notes: `Customer return: ${returnReason}`
        });
      }

      // Record return
      returnRecords.push({
        productId: returnItem.productId,
        quantity: returnItem.quantity,
        returnDate: new Date(),
        returnReason,
        refundAmount: returnItem.refundAmount,
        restocked: restockItems,
        processedById: userId,
        notes: returnItem.notes
      });
    }

    await salesOrder.update({
      returnRecords,
      totalRefunded: (salesOrder.totalRefunded || 0) + refundAmount
    }, { transaction });

    await transaction.commit();

    logger.info('Return processed', {
      salesOrderId,
      itemsReturned: returnItems.length,
      refundAmount,
      userId
    });

    return salesOrder;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to process return', {
      error: error.message,
      salesOrderId
    });
    throw error;
  }
}

/**
 * Get sales orders with filtering
 */
async function getSalesOrders(options = {}) {
  try {
    const {
      customerId,
      status,
      fulfillmentStatus,
      startDate,
      endDate,
      search,
      limit = 50,
      offset = 0,
      sortBy = 'orderDate',
      sortOrder = 'DESC'
    } = options;

    const where = {};

    if (customerId) where.customerId = customerId;
    if (status) where.status = status;
    if (fulfillmentStatus) where.fulfillmentStatus = fulfillmentStatus;

    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) where.orderDate[Op.gte] = startDate;
      if (endDate) where.orderDate[Op.lte] = endDate;
    }

    if (search) {
      where[Op.or] = [
        { orderNumber: { [Op.iLike]: `%${search}%` } },
        { notes: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await SalesOrder.findAndCountAll({
      where,
      include: [{
        model: Customer,
        as: 'customer',
        attributes: ['id', 'name', 'code', 'email']
      }],
      order: [[sortBy, sortOrder]],
      limit,
      offset
    });

    return {
      salesOrders: rows,
      pagination: {
        total: count,
        limit,
        offset,
        pages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    logger.error('Failed to get sales orders', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get sales order by ID
 */
async function getSalesOrderById(salesOrderId) {
  try {
    const salesOrder = await SalesOrder.findByPk(salesOrderId, {
      include: [{
        model: Customer,
        as: 'customer'
      }]
    });

    if (!salesOrder) {
      throw new Error('Sales order not found');
    }

    return salesOrder;
  } catch (error) {
    logger.error('Failed to get sales order', {
      error: error.message,
      salesOrderId
    });
    throw error;
  }
}

/**
 * Get sales analytics
 */
async function getSalesAnalytics(options = {}) {
  try {
    const { startDate, endDate, customerId } = options;
    const where = { status: { [Op.in]: ['delivered', 'completed'] } };

    if (customerId) where.customerId = customerId;

    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) where.orderDate[Op.gte] = startDate;
      if (endDate) where.orderDate[Op.lte] = endDate;
    }

    const orders = await SalesOrder.findAll({ where });

    const analytics = {
      totalOrders: orders.length,
      totalRevenue: orders.reduce((sum, so) => sum + parseFloat(so.total), 0),
      avgOrderValue: 0,
      totalItemsSold: 0,
      topProducts: {},
      revenueByMonth: {}
    };

    if (orders.length > 0) {
      analytics.avgOrderValue = analytics.totalRevenue / orders.length;

      // Calculate top products
      orders.forEach(order => {
        order.lineItems.forEach(item => {
          if (!analytics.topProducts[item.productId]) {
            analytics.topProducts[item.productId] = {
              productId: item.productId,
              name: item.name,
              quantity: 0,
              revenue: 0
            };
          }
          analytics.topProducts[item.productId].quantity += item.quantity;
          analytics.topProducts[item.productId].revenue += parseFloat(item.total);
          analytics.totalItemsSold += item.quantity;
        });

        // Revenue by month
        const monthKey = order.orderDate.toISOString().substring(0, 7);
        analytics.revenueByMonth[monthKey] = (analytics.revenueByMonth[monthKey] || 0) + parseFloat(order.total);
      });

      // Sort top products
      analytics.topProducts = Object.values(analytics.topProducts)
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 10);
    }

    return analytics;
  } catch (error) {
    logger.error('Failed to get sales analytics', {
      error: error.message
    });
    throw error;
  }
}

// Helper functions

/**
 * Generate unique order number
 */
async function generateOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `SO-${year}-`;

  const lastOrder = await SalesOrder.findOne({
    where: {
      orderNumber: { [Op.like]: `${prefix}%` }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastOrder) {
    const lastSequence = parseInt(lastOrder.orderNumber.split('-')[2]);
    sequence = lastSequence + 1;
  }

  return `${prefix}${sequence.toString().padStart(6, '0')}`;
}

/**
 * Calculate shipping cost
 */
function calculateShippingCost(shippingMethod, lineItems) {
  // Placeholder - would integrate with shipping carrier APIs
  const totalWeight = lineItems.reduce((sum, item) => sum + (item.weight || 0) * item.quantity, 0);

  const rates = {
    'standard': 5.99,
    'express': 15.99,
    'overnight': 29.99,
    'free': 0
  };

  return rates[shippingMethod] || rates['standard'];
}

/**
 * Send shipping notification
 */
async function sendShippingNotification(salesOrder) {
  try {
    // Get customer details
    const customer = await Customer.findByPk(salesOrder.customerId);

    // Trigger notification workflow
    await workflowService.triggerNotificationWorkflow({
      recipientIds: [salesOrder.customerId],
      notificationType: 'sales_order_shipped',
      subject: `Your Order ${salesOrder.orderNumber} Has Shipped`,
      message: `Your order has been shipped and is on its way. Tracking number: ${salesOrder.trackingNumber}`,
      data: {
        orderNumber: salesOrder.orderNumber,
        trackingNumber: salesOrder.trackingNumber,
        carrier: salesOrder.carrier,
        estimatedDelivery: salesOrder.expectedDeliveryDate
      },
      channels: ['email', 'sms'],
      priority: 7
    }, salesOrder.createdById);

    logger.info('Shipping notification triggered', {
      salesOrderId: salesOrder.id,
      customerId: salesOrder.customerId,
      trackingNumber: salesOrder.trackingNumber
    });
  } catch (error) {
    logger.error('Failed to send shipping notification', {
      error: error.message,
      salesOrderId: salesOrder.id
    });
    // Don't throw - notification failure shouldn't block order processing
  }
}

/**
 * Send delivery confirmation
 */
async function sendDeliveryConfirmation(salesOrder) {
  try {
    // Trigger notification workflow
    await workflowService.triggerNotificationWorkflow({
      recipientIds: [salesOrder.customerId],
      notificationType: 'sales_order_delivered',
      subject: `Your Order ${salesOrder.orderNumber} Has Been Delivered`,
      message: `Your order has been successfully delivered. Thank you for your business!`,
      data: {
        orderNumber: salesOrder.orderNumber,
        deliveryDate: salesOrder.actualDeliveryDate
      },
      channels: ['email'],
      priority: 5
    }, salesOrder.deliveredById);

    logger.info('Delivery confirmation triggered', {
      salesOrderId: salesOrder.id,
      customerId: salesOrder.customerId
    });
  } catch (error) {
    logger.error('Failed to send delivery confirmation', {
      error: error.message,
      salesOrderId: salesOrder.id
    });
    // Don't throw - notification failure shouldn't block order processing
  }
}

module.exports = {
  createSalesOrder,
  updateSalesOrder,
  approveSalesOrder,
  fulfillOrder,
  markAsDelivered,
  completeSalesOrder,
  cancelSalesOrder,
  processReturn,
  getSalesOrders,
  getSalesOrderById,
  getSalesAnalytics
};
