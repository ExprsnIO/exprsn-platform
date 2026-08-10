const { Op } = require('sequelize');
const { PurchaseOrder, Supplier, Product } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');
const inventoryService = require('./inventoryService');
const workflowService = require('../workflowIntegrationService');

/**
 * Purchase Service
 *
 * Handles purchase orders, supplier management, and approval workflows
 */

/**
 * Create purchase order
 */
async function createPurchaseOrder({
  supplierId,
  lineItems,
  orderDate = new Date(),
  requestedDeliveryDate,
  shippingAddress,
  billingAddress,
  paymentTerms,
  notes,
  userId
}) {
  const transaction = await sequelize.transaction();

  try {
    // Validate supplier
    const supplier = await Supplier.findByPk(supplierId);
    if (!supplier) {
      throw new Error('Supplier not found');
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
        total: lineTotal - lineDiscount + lineTax
      });

      subtotal += lineTotal;
    }

    // Calculate totals
    const discountAmount = lineItems.reduce((sum, item) => sum + (item.discount || 0), 0);
    const taxAmount = validatedLineItems.reduce((sum, item) => sum + item.tax, 0);
    const total = subtotal - discountAmount + taxAmount;

    // Generate PO number
    const poNumber = await generatePONumber();

    // Create purchase order
    const purchaseOrder = await PurchaseOrder.create({
      poNumber,
      supplierId,
      orderDate,
      requestedDeliveryDate,
      status: 'draft',
      subtotal,
      taxAmount,
      shippingAmount: 0,
      discountAmount,
      total,
      currency: supplier.currency || 'USD',
      lineItems: validatedLineItems,
      shippingAddress,
      billingAddress,
      paymentTerms: paymentTerms || supplier.paymentTerms,
      notes,
      createdById: userId
    }, { transaction });

    // Update product quantities on order
    for (const item of validatedLineItems) {
      await updateProductOnOrderQuantity(item.productId, item.quantity, 'add', transaction);
    }

    await transaction.commit();

    logger.info('Purchase order created', {
      purchaseOrderId: purchaseOrder.id,
      poNumber,
      supplierId,
      total,
      userId
    });

    return purchaseOrder;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to create purchase order', {
      error: error.message,
      supplierId
    });
    throw error;
  }
}

/**
 * Update purchase order
 */
async function updatePurchaseOrder(purchaseOrderId, updates, userId) {
  const transaction = await sequelize.transaction();

  try {
    const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId, { transaction });

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    // Cannot update if already received or completed
    if (['received', 'completed', 'cancelled'].includes(purchaseOrder.status)) {
      throw new Error(`Cannot update purchase order with status: ${purchaseOrder.status}`);
    }

    // If line items are updated, recalculate totals
    if (updates.lineItems) {
      const oldLineItems = purchaseOrder.lineItems;
      const newLineItems = updates.lineItems;

      // Update product on-order quantities
      for (const oldItem of oldLineItems) {
        await updateProductOnOrderQuantity(oldItem.productId, oldItem.quantity, 'subtract', transaction);
      }

      for (const newItem of newLineItems) {
        await updateProductOnOrderQuantity(newItem.productId, newItem.quantity, 'add', transaction);
      }

      // Recalculate totals
      const subtotal = newLineItems.reduce((sum, item) => sum + (item.quantity * item.unitPrice), 0);
      const discountAmount = newLineItems.reduce((sum, item) => sum + (item.discount || 0), 0);
      const taxAmount = newLineItems.reduce((sum, item) => sum + (item.tax || 0), 0);
      const total = subtotal - discountAmount + taxAmount;

      updates.subtotal = subtotal;
      updates.discountAmount = discountAmount;
      updates.taxAmount = taxAmount;
      updates.total = total;
    }

    updates.lastModifiedById = userId;
    updates.lastModifiedAt = new Date();

    await purchaseOrder.update(updates, { transaction });

    await transaction.commit();

    logger.info('Purchase order updated', {
      purchaseOrderId,
      userId
    });

    return purchaseOrder;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to update purchase order', {
      error: error.message,
      purchaseOrderId
    });
    throw error;
  }
}

/**
 * Submit purchase order for approval
 */
async function submitForApproval(purchaseOrderId, userId) {
  try {
    const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId);

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (purchaseOrder.status !== 'draft') {
      throw new Error('Only draft purchase orders can be submitted for approval');
    }

    await purchaseOrder.update({
      status: 'pending_approval',
      approvalStatus: 'pending',
      submittedForApprovalAt: new Date(),
      submittedForApprovalById: userId
    });

    // Trigger approval workflow
    await triggerApprovalWorkflow(purchaseOrder, userId);

    logger.info('Purchase order submitted for approval', {
      purchaseOrderId,
      userId
    });

    return purchaseOrder;
  } catch (error) {
    logger.error('Failed to submit purchase order for approval', {
      error: error.message,
      purchaseOrderId
    });
    throw error;
  }
}

/**
 * Approve purchase order
 */
async function approvePurchaseOrder(purchaseOrderId, userId, comments) {
  try {
    const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId);

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (purchaseOrder.status !== 'pending_approval') {
      throw new Error('Purchase order is not pending approval');
    }

    await purchaseOrder.update({
      status: 'approved',
      approvalStatus: 'approved',
      approvedById: userId,
      approvedAt: new Date(),
      approvalComments: comments
    });

    // Trigger approved workflow
    await workflowService.triggerPurchaseApprovedWorkflow(purchaseOrder, userId);

    logger.info('Purchase order approved', {
      purchaseOrderId,
      userId
    });

    return purchaseOrder;
  } catch (error) {
    logger.error('Failed to approve purchase order', {
      error: error.message,
      purchaseOrderId
    });
    throw error;
  }
}

/**
 * Reject purchase order
 */
async function rejectPurchaseOrder(purchaseOrderId, userId, reason) {
  try {
    const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId);

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (purchaseOrder.status !== 'pending_approval') {
      throw new Error('Purchase order is not pending approval');
    }

    await purchaseOrder.update({
      status: 'draft',
      approvalStatus: 'rejected',
      rejectedById: userId,
      rejectedAt: new Date(),
      rejectionReason: reason
    });

    logger.info('Purchase order rejected', {
      purchaseOrderId,
      userId,
      reason
    });

    return purchaseOrder;
  } catch (error) {
    logger.error('Failed to reject purchase order', {
      error: error.message,
      purchaseOrderId
    });
    throw error;
  }
}

/**
 * Send purchase order to supplier
 */
async function sendToSupplier(purchaseOrderId, userId) {
  try {
    const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId, {
      include: [{ model: Supplier, as: 'supplier' }]
    });

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (purchaseOrder.status !== 'approved') {
      throw new Error('Only approved purchase orders can be sent');
    }

    await purchaseOrder.update({
      status: 'sent',
      sentToSupplierAt: new Date(),
      sentToSupplierById: userId
    });

    // Send email to supplier
    await sendPurchaseOrderEmail(purchaseOrder);

    logger.info('Purchase order sent to supplier', {
      purchaseOrderId,
      supplierId: purchaseOrder.supplierId,
      userId
    });

    return purchaseOrder;
  } catch (error) {
    logger.error('Failed to send purchase order to supplier', {
      error: error.message,
      purchaseOrderId
    });
    throw error;
  }
}

/**
 * Receive goods (full or partial)
 */
async function receiveGoods({
  purchaseOrderId,
  receivedItems,
  locationId,
  receivedDate = new Date(),
  userId,
  notes
}) {
  const transaction = await sequelize.transaction();

  try {
    const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId, { transaction });

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (!['sent', 'partially_received'].includes(purchaseOrder.status)) {
      throw new Error('Purchase order must be sent before receiving goods');
    }

    const lineItems = purchaseOrder.lineItems;
    const receivingRecords = purchaseOrder.receivingRecords || [];

    // Process each received item
    for (const receivedItem of receivedItems) {
      const lineItem = lineItems.find(li => li.productId === receivedItem.productId);

      if (!lineItem) {
        throw new Error(`Product ${receivedItem.productId} not found in purchase order`);
      }

      // Calculate total received so far
      const previouslyReceived = receivingRecords
        .filter(r => r.productId === receivedItem.productId)
        .reduce((sum, r) => sum + r.quantity, 0);

      const totalReceived = previouslyReceived + receivedItem.quantity;

      if (totalReceived > lineItem.quantity) {
        throw new Error(`Cannot receive more than ordered quantity for ${lineItem.name}`);
      }

      // Receive into inventory
      await inventoryService.receiveStock({
        productId: receivedItem.productId,
        locationId,
        quantity: receivedItem.quantity,
        unitCost: lineItem.unitPrice,
        referenceType: 'purchase_order',
        referenceId: purchaseOrderId,
        referenceNumber: purchaseOrder.poNumber,
        serialNumbers: receivedItem.serialNumbers,
        lotNumber: receivedItem.lotNumber,
        batchNumber: receivedItem.batchNumber,
        expiryDate: receivedItem.expiryDate,
        binLocation: receivedItem.binLocation,
        userId,
        notes
      });

      // Record receipt
      receivingRecords.push({
        productId: receivedItem.productId,
        quantity: receivedItem.quantity,
        receivedDate,
        receivedById: userId,
        locationId,
        serialNumbers: receivedItem.serialNumbers,
        lotNumber: receivedItem.lotNumber,
        notes: receivedItem.notes
      });

      // Update product on-order quantity
      await updateProductOnOrderQuantity(receivedItem.productId, receivedItem.quantity, 'subtract', transaction);
    }

    // Update purchase order status
    const allItemsReceived = lineItems.every(lineItem => {
      const totalReceived = receivingRecords
        .filter(r => r.productId === lineItem.productId)
        .reduce((sum, r) => sum + r.quantity, 0);
      return totalReceived >= lineItem.quantity;
    });

    const newStatus = allItemsReceived ? 'received' : 'partially_received';

    await purchaseOrder.update({
      status: newStatus,
      receivingRecords,
      actualDeliveryDate: allItemsReceived ? receivedDate : purchaseOrder.actualDeliveryDate
    }, { transaction });

    await transaction.commit();

    logger.info('Goods received', {
      purchaseOrderId,
      itemsReceived: receivedItems.length,
      fullyReceived: allItemsReceived,
      userId
    });

    return purchaseOrder;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to receive goods', {
      error: error.message,
      purchaseOrderId
    });
    throw error;
  }
}

/**
 * Complete purchase order
 */
async function completePurchaseOrder(purchaseOrderId, userId) {
  try {
    const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId);

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (purchaseOrder.status !== 'received') {
      throw new Error('Purchase order must be fully received before completion');
    }

    await purchaseOrder.update({
      status: 'completed',
      completedAt: new Date(),
      completedById: userId
    });

    logger.info('Purchase order completed', {
      purchaseOrderId,
      userId
    });

    return purchaseOrder;
  } catch (error) {
    logger.error('Failed to complete purchase order', {
      error: error.message,
      purchaseOrderId
    });
    throw error;
  }
}

/**
 * Cancel purchase order
 */
async function cancelPurchaseOrder(purchaseOrderId, userId, reason) {
  const transaction = await sequelize.transaction();

  try {
    const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId, { transaction });

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    if (['received', 'completed', 'cancelled'].includes(purchaseOrder.status)) {
      throw new Error(`Cannot cancel purchase order with status: ${purchaseOrder.status}`);
    }

    // Release product on-order quantities
    for (const lineItem of purchaseOrder.lineItems) {
      await updateProductOnOrderQuantity(lineItem.productId, lineItem.quantity, 'subtract', transaction);
    }

    await purchaseOrder.update({
      status: 'cancelled',
      cancelledAt: new Date(),
      cancelledById: userId,
      cancellationReason: reason
    }, { transaction });

    await transaction.commit();

    logger.info('Purchase order cancelled', {
      purchaseOrderId,
      userId,
      reason
    });

    return purchaseOrder;
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to cancel purchase order', {
      error: error.message,
      purchaseOrderId
    });
    throw error;
  }
}

/**
 * Get purchase orders with filtering
 */
async function getPurchaseOrders(options = {}) {
  try {
    const {
      supplierId,
      status,
      approvalStatus,
      startDate,
      endDate,
      search,
      limit = 50,
      offset = 0,
      sortBy = 'orderDate',
      sortOrder = 'DESC'
    } = options;

    const where = {};

    if (supplierId) where.supplierId = supplierId;
    if (status) where.status = status;
    if (approvalStatus) where.approvalStatus = approvalStatus;

    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) where.orderDate[Op.gte] = startDate;
      if (endDate) where.orderDate[Op.lte] = endDate;
    }

    if (search) {
      where[Op.or] = [
        { poNumber: { [Op.iLike]: `%${search}%` } },
        { notes: { [Op.iLike]: `%${search}%` } }
      ];
    }

    const { count, rows } = await PurchaseOrder.findAndCountAll({
      where,
      include: [{
        model: Supplier,
        as: 'supplier',
        attributes: ['id', 'name', 'code', 'email']
      }],
      order: [[sortBy, sortOrder]],
      limit,
      offset
    });

    return {
      purchaseOrders: rows,
      pagination: {
        total: count,
        limit,
        offset,
        pages: Math.ceil(count / limit)
      }
    };
  } catch (error) {
    logger.error('Failed to get purchase orders', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get purchase order by ID
 */
async function getPurchaseOrderById(purchaseOrderId) {
  try {
    const purchaseOrder = await PurchaseOrder.findByPk(purchaseOrderId, {
      include: [{
        model: Supplier,
        as: 'supplier'
      }]
    });

    if (!purchaseOrder) {
      throw new Error('Purchase order not found');
    }

    return purchaseOrder;
  } catch (error) {
    logger.error('Failed to get purchase order', {
      error: error.message,
      purchaseOrderId
    });
    throw error;
  }
}

/**
 * Get supplier performance metrics
 */
async function getSupplierPerformance(supplierId, options = {}) {
  try {
    const { startDate, endDate } = options;
    const where = { supplierId, status: { [Op.in]: ['received', 'completed'] } };

    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) where.orderDate[Op.gte] = startDate;
      if (endDate) where.orderDate[Op.lte] = endDate;
    }

    const orders = await PurchaseOrder.findAll({ where });

    const metrics = {
      totalOrders: orders.length,
      totalValue: orders.reduce((sum, po) => sum + parseFloat(po.total), 0),
      avgOrderValue: 0,
      onTimeDeliveries: 0,
      lateDeliveries: 0,
      avgDeliveryTime: 0,
      onTimePercentage: 0
    };

    if (orders.length > 0) {
      metrics.avgOrderValue = metrics.totalValue / orders.length;

      const deliveryMetrics = orders
        .filter(po => po.actualDeliveryDate && po.expectedDeliveryDate)
        .map(po => {
          const expected = new Date(po.expectedDeliveryDate);
          const actual = new Date(po.actualDeliveryDate);
          const diffDays = (actual - expected) / (1000 * 60 * 60 * 24);
          return {
            onTime: diffDays <= 0,
            deliveryTime: diffDays
          };
        });

      metrics.onTimeDeliveries = deliveryMetrics.filter(d => d.onTime).length;
      metrics.lateDeliveries = deliveryMetrics.filter(d => !d.onTime).length;
      metrics.onTimePercentage = (metrics.onTimeDeliveries / deliveryMetrics.length) * 100;
      metrics.avgDeliveryTime = deliveryMetrics.reduce((sum, d) => sum + d.deliveryTime, 0) / deliveryMetrics.length;
    }

    return metrics;
  } catch (error) {
    logger.error('Failed to get supplier performance', {
      error: error.message,
      supplierId
    });
    throw error;
  }
}

// Helper functions

/**
 * Generate unique PO number
 */
async function generatePONumber() {
  const year = new Date().getFullYear();
  const prefix = `PO-${year}-`;

  const lastPO = await PurchaseOrder.findOne({
    where: {
      poNumber: { [Op.like]: `${prefix}%` }
    },
    order: [['createdAt', 'DESC']]
  });

  let sequence = 1;
  if (lastPO) {
    const lastSequence = parseInt(lastPO.poNumber.split('-')[2]);
    sequence = lastSequence + 1;
  }

  return `${prefix}${sequence.toString().padStart(6, '0')}`;
}

/**
 * Update product quantity on order
 */
async function updateProductOnOrderQuantity(productId, quantity, operation, transaction) {
  const product = await Product.findByPk(productId, { transaction });

  if (!product) {
    throw new Error('Product not found');
  }

  const currentQty = product.quantityOnOrder || 0;
  const newQty = operation === 'add' ? currentQty + quantity : Math.max(0, currentQty - quantity);

  await product.update({ quantityOnOrder: newQty }, { transaction });
}

/**
 * Trigger approval workflow
 */
async function triggerApprovalWorkflow(purchaseOrder, userId) {
  try {
    // Get supplier details
    const supplier = await Supplier.findByPk(purchaseOrder.supplierId);

    // Trigger purchase order approval workflow
    await workflowService.triggerPurchaseApprovalWorkflow({
      ...purchaseOrder.toJSON(),
      supplier
    }, userId);

    logger.info('Approval workflow triggered', {
      purchaseOrderId: purchaseOrder.id,
      amount: purchaseOrder.total
    });
  } catch (error) {
    logger.error('Failed to trigger approval workflow', {
      error: error.message,
      purchaseOrderId: purchaseOrder.id
    });
    // Don't throw - workflow triggering is non-critical
  }
}

/**
 * Send purchase order email to supplier
 */
async function sendPurchaseOrderEmail(purchaseOrder) {
  // This would integrate with the Herald notification service
  logger.info('Purchase order email queued', {
    purchaseOrderId: purchaseOrder.id,
    supplierId: purchaseOrder.supplierId
  });

  // TODO: Queue email via Herald
}

module.exports = {
  createPurchaseOrder,
  updatePurchaseOrder,
  submitForApproval,
  approvePurchaseOrder,
  rejectPurchaseOrder,
  sendToSupplier,
  receiveGoods,
  completePurchaseOrder,
  cancelPurchaseOrder,
  getPurchaseOrders,
  getPurchaseOrderById,
  getSupplierPerformance
};
