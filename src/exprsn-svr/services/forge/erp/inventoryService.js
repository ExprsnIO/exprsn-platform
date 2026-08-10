const { Op } = require('sequelize');
const { Inventory, Product, StockMovement } = require('../../../models/forge');
const logger = require('../../../utils/logger');
const { sequelize } = require('../../../config/database');
const workflowService = require('../workflowIntegrationService');

/**
 * Inventory Service
 *
 * Handles inventory management, stock movements, and multi-location tracking
 */

/**
 * Get inventory for a product at a specific location
 */
async function getInventory(productId, locationId) {
  try {
    const inventory = await Inventory.findOne({
      where: { productId, locationId },
      include: [{
        model: Product,
        as: 'product',
        attributes: ['id', 'name', 'sku', 'barcode']
      }]
    });

    if (!inventory) {
      throw new Error('Inventory record not found');
    }

    return inventory;
  } catch (error) {
    logger.error('Failed to get inventory', {
      error: error.message,
      productId,
      locationId
    });
    throw error;
  }
}

/**
 * Get all inventory locations for a product
 */
async function getProductInventory(productId) {
  try {
    const inventoryRecords = await Inventory.findAll({
      where: { productId, isActive: true },
      order: [['locationId', 'ASC']]
    });

    const totalQuantity = inventoryRecords.reduce((sum, inv) => sum + inv.quantityOnHand, 0);
    const totalAvailable = inventoryRecords.reduce((sum, inv) => sum + inv.quantityAvailable, 0);
    const totalValue = inventoryRecords.reduce((sum, inv) => sum + (parseFloat(inv.totalValue) || 0), 0);

    return {
      locations: inventoryRecords,
      totals: {
        quantityOnHand: totalQuantity,
        quantityAvailable: totalAvailable,
        totalValue: totalValue.toFixed(2)
      }
    };
  } catch (error) {
    logger.error('Failed to get product inventory', {
      error: error.message,
      productId
    });
    throw error;
  }
}

/**
 * Record stock receipt (from purchase order)
 */
async function receiveStock({
  productId,
  locationId,
  quantity,
  unitCost,
  referenceType = 'purchase_order',
  referenceId,
  referenceNumber,
  serialNumbers,
  lotNumber,
  batchNumber,
  expiryDate,
  binLocation,
  userId,
  notes
}) {
  const transaction = await sequelize.transaction();

  try {
    // Get or create inventory record
    let inventory = await Inventory.findOne({
      where: { productId, locationId },
      transaction
    });

    const beforeQuantity = inventory ? inventory.quantityOnHand : 0;

    if (!inventory) {
      inventory = await Inventory.create({
        productId,
        locationId,
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityAvailable: 0,
        quantityOnOrder: 0
      }, { transaction });
    }

    // Calculate new quantities
    const newQuantityOnHand = inventory.quantityOnHand + quantity;
    const newQuantityAvailable = newQuantityOnHand - inventory.quantityReserved;

    // Update costing (FIFO/LIFO/Average)
    let newAverageCost = inventory.averageCost || 0;
    if (inventory.costingMethod === 'average' && unitCost) {
      const totalCost = (inventory.averageCost * inventory.quantityOnHand) + (unitCost * quantity);
      newAverageCost = totalCost / newQuantityOnHand;
    }

    // Update inventory
    await inventory.update({
      quantityOnHand: newQuantityOnHand,
      quantityAvailable: newQuantityAvailable,
      lastCost: unitCost || inventory.lastCost,
      averageCost: unitCost ? newAverageCost : inventory.averageCost,
      totalValue: newQuantityOnHand * newAverageCost,
      lastMovementDate: new Date(),
      reorderStatus: calculateReorderStatus(newQuantityOnHand, inventory.reorderPoint, inventory.minStock, inventory.maxStock)
    }, { transaction });

    // Update serial/lot tracking if applicable
    if (inventory.trackingMethod === 'serial' && serialNumbers) {
      const currentSerials = inventory.serialNumbers || [];
      const newSerials = serialNumbers.map(sn => ({
        serial: sn,
        status: 'in_stock',
        receivedDate: new Date()
      }));
      await inventory.update({
        serialNumbers: [...currentSerials, ...newSerials]
      }, { transaction });
    }

    if (inventory.trackingMethod === 'lot' && lotNumber) {
      const currentLots = inventory.lotNumbers || [];
      const existingLotIndex = currentLots.findIndex(lot => lot.lot === lotNumber);

      if (existingLotIndex >= 0) {
        currentLots[existingLotIndex].quantity += quantity;
      } else {
        currentLots.push({
          lot: lotNumber,
          quantity,
          expiryDate,
          receivedDate: new Date()
        });
      }

      await inventory.update({
        lotNumbers: currentLots
      }, { transaction });
    }

    // Create stock movement record
    const movement = await StockMovement.create({
      movementNumber: `RCV-${Date.now()}`,
      productId,
      type: 'receipt',
      toLocationId: locationId,
      quantity,
      unitCost,
      totalCost: unitCost ? unitCost * quantity : null,
      serialNumbers,
      lotNumber,
      batchNumber,
      expiryDate,
      toBinLocation: binLocation,
      referenceType,
      referenceId,
      referenceNumber,
      movementDate: new Date(),
      status: 'completed',
      createdById: userId,
      beforeQuantity,
      afterQuantity: newQuantityOnHand,
      notes
    }, { transaction });

    await transaction.commit();

    logger.info('Stock received', {
      productId,
      locationId,
      quantity,
      movementId: movement.id
    });

    return {
      inventory,
      movement
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to receive stock', {
      error: error.message,
      productId,
      locationId
    });
    throw error;
  }
}

/**
 * Ship stock (for sales order)
 */
async function shipStock({
  productId,
  locationId,
  quantity,
  referenceType = 'sales_order',
  referenceId,
  referenceNumber,
  serialNumbers,
  lotNumber,
  binLocation,
  userId,
  notes
}) {
  const transaction = await sequelize.transaction();

  try {
    const inventory = await Inventory.findOne({
      where: { productId, locationId },
      transaction
    });

    if (!inventory) {
      throw new Error('Inventory record not found');
    }

    if (inventory.quantityAvailable < quantity) {
      throw new Error(`Insufficient stock. Available: ${inventory.quantityAvailable}, Requested: ${quantity}`);
    }

    const beforeQuantity = inventory.quantityOnHand;
    const newQuantityOnHand = inventory.quantityOnHand - quantity;
    const newQuantityAvailable = newQuantityOnHand - inventory.quantityReserved;

    // Update inventory
    await inventory.update({
      quantityOnHand: newQuantityOnHand,
      quantityAvailable: newQuantityAvailable,
      totalValue: newQuantityOnHand * (inventory.averageCost || 0),
      lastMovementDate: new Date(),
      reorderStatus: calculateReorderStatus(newQuantityOnHand, inventory.reorderPoint, inventory.minStock, inventory.maxStock)
    }, { transaction });

    // Update serial/lot tracking
    if (inventory.trackingMethod === 'serial' && serialNumbers) {
      const currentSerials = inventory.serialNumbers || [];
      const updatedSerials = currentSerials.map(sn => {
        if (serialNumbers.includes(sn.serial)) {
          return { ...sn, status: 'shipped', shippedDate: new Date() };
        }
        return sn;
      });
      await inventory.update({ serialNumbers: updatedSerials }, { transaction });
    }

    if (inventory.trackingMethod === 'lot' && lotNumber) {
      const currentLots = inventory.lotNumbers || [];
      const lotIndex = currentLots.findIndex(lot => lot.lot === lotNumber);

      if (lotIndex < 0) {
        throw new Error(`Lot number ${lotNumber} not found`);
      }

      if (currentLots[lotIndex].quantity < quantity) {
        throw new Error(`Insufficient quantity in lot ${lotNumber}`);
      }

      currentLots[lotIndex].quantity -= quantity;
      if (currentLots[lotIndex].quantity === 0) {
        currentLots.splice(lotIndex, 1);
      }

      await inventory.update({ lotNumbers: currentLots }, { transaction });
    }

    // Create stock movement record
    const movement = await StockMovement.create({
      movementNumber: `SHIP-${Date.now()}`,
      productId,
      type: 'shipment',
      fromLocationId: locationId,
      quantity: -quantity, // Negative for outbound
      serialNumbers,
      lotNumber,
      fromBinLocation: binLocation,
      referenceType,
      referenceId,
      referenceNumber,
      movementDate: new Date(),
      status: 'completed',
      createdById: userId,
      beforeQuantity,
      afterQuantity: newQuantityOnHand,
      notes
    }, { transaction });

    await transaction.commit();

    logger.info('Stock shipped', {
      productId,
      locationId,
      quantity,
      movementId: movement.id
    });

    // Check if auto-reorder is needed
    if (inventory.autoReorder && newQuantityOnHand <= inventory.reorderPoint) {
      await triggerAutoReorder(inventory, userId);
    }

    // Trigger workflow for low stock or critical status
    if (['low_stock', 'reorder_needed', 'critical'].includes(inventory.reorderStatus)) {
      await triggerStockWorkflows(inventory, userId);
    }

    return {
      inventory,
      movement
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to ship stock', {
      error: error.message,
      productId,
      locationId
    });
    throw error;
  }
}

/**
 * Transfer stock between locations
 */
async function transferStock({
  productId,
  fromLocationId,
  toLocationId,
  quantity,
  serialNumbers,
  lotNumber,
  fromBinLocation,
  toBinLocation,
  userId,
  reason,
  notes
}) {
  const transaction = await sequelize.transaction();

  try {
    // Get source inventory
    const fromInventory = await Inventory.findOne({
      where: { productId, locationId: fromLocationId },
      transaction
    });

    if (!fromInventory) {
      throw new Error('Source inventory not found');
    }

    if (fromInventory.quantityAvailable < quantity) {
      throw new Error(`Insufficient stock at source location`);
    }

    // Get or create destination inventory
    let toInventory = await Inventory.findOne({
      where: { productId, locationId: toLocationId },
      transaction
    });

    if (!toInventory) {
      toInventory = await Inventory.create({
        productId,
        locationId: toLocationId,
        quantityOnHand: 0,
        quantityReserved: 0,
        quantityAvailable: 0,
        quantityOnOrder: 0,
        costingMethod: fromInventory.costingMethod,
        averageCost: fromInventory.averageCost,
        trackingMethod: fromInventory.trackingMethod
      }, { transaction });
    }

    // Update source location
    await fromInventory.update({
      quantityOnHand: fromInventory.quantityOnHand - quantity,
      quantityAvailable: fromInventory.quantityAvailable - quantity,
      totalValue: (fromInventory.quantityOnHand - quantity) * (fromInventory.averageCost || 0),
      lastMovementDate: new Date()
    }, { transaction });

    // Update destination location
    await toInventory.update({
      quantityOnHand: toInventory.quantityOnHand + quantity,
      quantityAvailable: toInventory.quantityAvailable + quantity,
      totalValue: (toInventory.quantityOnHand + quantity) * (toInventory.averageCost || 0),
      lastMovementDate: new Date()
    }, { transaction });

    // Create stock movement records (one for each side of transfer)
    const transferNumber = `TRF-${Date.now()}`;

    const movementOut = await StockMovement.create({
      movementNumber: `${transferNumber}-OUT`,
      productId,
      type: 'transfer_out',
      fromLocationId,
      toLocationId,
      quantity: -quantity,
      serialNumbers,
      lotNumber,
      fromBinLocation,
      toBinLocation,
      referenceType: 'transfer',
      movementDate: new Date(),
      status: 'completed',
      createdById: userId,
      reason,
      notes
    }, { transaction });

    const movementIn = await StockMovement.create({
      movementNumber: `${transferNumber}-IN`,
      productId,
      type: 'transfer_in',
      fromLocationId,
      toLocationId,
      quantity,
      serialNumbers,
      lotNumber,
      fromBinLocation,
      toBinLocation,
      referenceType: 'transfer',
      referenceId: movementOut.id,
      movementDate: new Date(),
      status: 'completed',
      createdById: userId,
      reason,
      notes
    }, { transaction });

    await transaction.commit();

    logger.info('Stock transferred', {
      productId,
      fromLocationId,
      toLocationId,
      quantity
    });

    return {
      fromInventory,
      toInventory,
      movements: [movementOut, movementIn]
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to transfer stock', {
      error: error.message,
      productId,
      fromLocationId,
      toLocationId
    });
    throw error;
  }
}

/**
 * Adjust inventory (correction/reconciliation)
 */
async function adjustInventory({
  productId,
  locationId,
  newQuantity,
  reason,
  userId,
  notes
}) {
  const transaction = await sequelize.transaction();

  try {
    const inventory = await Inventory.findOne({
      where: { productId, locationId },
      transaction
    });

    if (!inventory) {
      throw new Error('Inventory record not found');
    }

    const beforeQuantity = inventory.quantityOnHand;
    const adjustment = newQuantity - beforeQuantity;

    await inventory.update({
      quantityOnHand: newQuantity,
      quantityAvailable: newQuantity - inventory.quantityReserved,
      totalValue: newQuantity * (inventory.averageCost || 0),
      lastMovementDate: new Date(),
      lastStockCheckDate: new Date(),
      reorderStatus: calculateReorderStatus(newQuantity, inventory.reorderPoint, inventory.minStock, inventory.maxStock)
    }, { transaction });

    const movement = await StockMovement.create({
      movementNumber: `ADJ-${Date.now()}`,
      productId,
      type: 'adjustment',
      toLocationId: locationId,
      quantity: adjustment,
      movementDate: new Date(),
      status: 'completed',
      createdById: userId,
      beforeQuantity,
      afterQuantity: newQuantity,
      reason,
      notes
    }, { transaction });

    await transaction.commit();

    logger.info('Inventory adjusted', {
      productId,
      locationId,
      beforeQuantity,
      afterQuantity: newQuantity,
      adjustment
    });

    return {
      inventory,
      movement
    };
  } catch (error) {
    await transaction.rollback();
    logger.error('Failed to adjust inventory', {
      error: error.message,
      productId,
      locationId
    });
    throw error;
  }
}

/**
 * Reserve stock for order
 */
async function reserveStock(productId, locationId, quantity, referenceId) {
  try {
    const inventory = await Inventory.findOne({
      where: { productId, locationId }
    });

    if (!inventory) {
      throw new Error('Inventory record not found');
    }

    if (inventory.quantityAvailable < quantity) {
      throw new Error('Insufficient stock available to reserve');
    }

    await inventory.update({
      quantityReserved: inventory.quantityReserved + quantity,
      quantityAvailable: inventory.quantityAvailable - quantity
    });

    logger.info('Stock reserved', {
      productId,
      locationId,
      quantity,
      referenceId
    });

    return inventory;
  } catch (error) {
    logger.error('Failed to reserve stock', {
      error: error.message,
      productId,
      locationId
    });
    throw error;
  }
}

/**
 * Release reserved stock
 */
async function releaseReservedStock(productId, locationId, quantity) {
  try {
    const inventory = await Inventory.findOne({
      where: { productId, locationId }
    });

    if (!inventory) {
      throw new Error('Inventory record not found');
    }

    const newReserved = Math.max(0, inventory.quantityReserved - quantity);
    const released = inventory.quantityReserved - newReserved;

    await inventory.update({
      quantityReserved: newReserved,
      quantityAvailable: inventory.quantityAvailable + released
    });

    logger.info('Stock reservation released', {
      productId,
      locationId,
      quantity: released
    });

    return inventory;
  } catch (error) {
    logger.error('Failed to release reserved stock', {
      error: error.message,
      productId,
      locationId
    });
    throw error;
  }
}

/**
 * Get stock movement history
 */
async function getStockMovements(productId, options = {}) {
  try {
    const {
      locationId,
      type,
      startDate,
      endDate,
      limit = 100,
      offset = 0
    } = options;

    const where = { productId };

    if (locationId) {
      where[Op.or] = [
        { fromLocationId: locationId },
        { toLocationId: locationId }
      ];
    }

    if (type) {
      where.type = type;
    }

    if (startDate || endDate) {
      where.movementDate = {};
      if (startDate) where.movementDate[Op.gte] = startDate;
      if (endDate) where.movementDate[Op.lte] = endDate;
    }

    const movements = await StockMovement.findAll({
      where,
      order: [['movementDate', 'DESC']],
      limit,
      offset
    });

    return movements;
  } catch (error) {
    logger.error('Failed to get stock movements', {
      error: error.message,
      productId
    });
    throw error;
  }
}

/**
 * Get low stock items
 */
async function getLowStockItems(locationId = null) {
  try {
    const where = {
      reorderStatus: {
        [Op.in]: ['low_stock', 'reorder_needed', 'critical']
      },
      isActive: true
    };

    if (locationId) {
      where.locationId = locationId;
    }

    const items = await Inventory.findAll({
      where,
      include: [{
        model: Product,
        as: 'product',
        attributes: ['id', 'name', 'sku', 'barcode']
      }],
      order: [
        ['reorderStatus', 'DESC'], // Critical first
        ['quantityAvailable', 'ASC']
      ]
    });

    return items;
  } catch (error) {
    logger.error('Failed to get low stock items', {
      error: error.message
    });
    throw error;
  }
}

/**
 * Get inventory valuation
 */
async function getInventoryValuation(locationId = null) {
  try {
    const where = { isActive: true };
    if (locationId) where.locationId = locationId;

    const inventoryItems = await Inventory.findAll({ where });

    const valuation = inventoryItems.reduce((acc, item) => {
      const value = parseFloat(item.totalValue) || 0;
      return {
        totalValue: acc.totalValue + value,
        totalItems: acc.totalItems + 1,
        totalQuantity: acc.totalQuantity + item.quantityOnHand
      };
    }, { totalValue: 0, totalItems: 0, totalQuantity: 0 });

    return valuation;
  } catch (error) {
    logger.error('Failed to get inventory valuation', {
      error: error.message
    });
    throw error;
  }
}

// Helper functions

/**
 * Calculate reorder status based on quantity and thresholds
 */
function calculateReorderStatus(quantity, reorderPoint, minStock, maxStock) {
  if (!reorderPoint) return 'normal';

  if (quantity === 0) return 'critical';
  if (quantity <= minStock) return 'critical';
  if (quantity <= reorderPoint) return 'reorder_needed';
  if (quantity < reorderPoint * 1.5) return 'low_stock';
  if (maxStock && quantity > maxStock) return 'overstock';

  return 'normal';
}

/**
 * Trigger auto-reorder workflow
 */
async function triggerAutoReorder(inventory, userId) {
  try {
    logger.info('Auto-reorder triggered', {
      productId: inventory.productId,
      locationId: inventory.locationId,
      currentQuantity: inventory.quantityOnHand,
      reorderPoint: inventory.reorderPoint,
      reorderQuantity: inventory.reorderQuantity
    });

    // Get product details
    const product = await Product.findByPk(inventory.productId);

    // Trigger reorder workflow
    await workflowService.triggerReorderWorkflow({
      productId: inventory.productId,
      locationId: inventory.locationId,
      quantityOnHand: inventory.quantityOnHand,
      reorderPoint: inventory.reorderPoint,
      reorderQuantity: inventory.reorderQuantity,
      reorderStatus: inventory.reorderStatus,
      preferredSupplierId: product?.preferredSupplierId,
      productName: product?.name,
      productSku: product?.sku,
      lastCost: inventory.lastCost
    }, userId);

    // Mark last reorder date
    await inventory.update({
      lastReorderDate: new Date()
    });
  } catch (error) {
    logger.error('Failed to trigger auto-reorder', {
      error: error.message,
      inventoryId: inventory.id
    });
  }
}

/**
 * Trigger stock-related workflows
 */
async function triggerStockWorkflows(inventory, userId) {
  try {
    // Get product details
    const product = await Product.findByPk(inventory.productId);

    const inventoryData = {
      productId: inventory.productId,
      locationId: inventory.locationId,
      quantityOnHand: inventory.quantityOnHand,
      quantityAvailable: inventory.quantityAvailable,
      reorderPoint: inventory.reorderPoint,
      reorderQuantity: inventory.reorderQuantity,
      reorderStatus: inventory.reorderStatus,
      productName: product?.name,
      productSku: product?.sku
    };

    // Trigger appropriate workflow based on status
    if (inventory.reorderStatus === 'low_stock') {
      await workflowService.triggerLowStockWorkflow(inventoryData, userId);
    } else if (inventory.reorderStatus === 'reorder_needed' || inventory.reorderStatus === 'critical') {
      await workflowService.triggerReorderWorkflow({
        ...inventoryData,
        preferredSupplierId: product?.preferredSupplierId,
        lastCost: inventory.lastCost
      }, userId);
    }
  } catch (error) {
    logger.error('Failed to trigger stock workflows', {
      error: error.message,
      inventoryId: inventory.id
    });
    // Don't throw - workflow triggering is non-critical
  }
}

module.exports = {
  getInventory,
  getProductInventory,
  receiveStock,
  shipStock,
  transferStock,
  adjustInventory,
  reserveStock,
  releaseReservedStock,
  getStockMovements,
  getLowStockItems,
  getInventoryValuation
};
