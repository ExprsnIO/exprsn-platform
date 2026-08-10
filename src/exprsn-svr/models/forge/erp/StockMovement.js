const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const StockMovement = sequelize.define('StockMovement', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  movementNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'movement_number'
  },
  // Product reference
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'product_id'
  },
  // Movement type
  type: {
    type: DataTypes.ENUM(
      'receipt',           // Received from supplier
      'shipment',          // Shipped to customer
      'transfer_in',       // Transfer from another location
      'transfer_out',      // Transfer to another location
      'adjustment',        // Inventory adjustment
      'return_in',         // Customer return
      'return_out',        // Return to supplier
      'production_in',     // Manufacturing output
      'production_out',    // Manufacturing consumption
      'damage',            // Damaged/spoiled goods
      'sample',            // Sample given
      'correction'         // Correction/reconciliation
    ),
    allowNull: false
  },
  // Locations
  fromLocationId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'from_location_id'
  },
  toLocationId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'to_location_id'
  },
  // Quantity
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    comment: 'Positive for increases, negative for decreases'
  },
  unitOfMeasure: {
    type: DataTypes.STRING(20),
    allowNull: true,
    field: 'unit_of_measure'
  },
  // Cost tracking
  unitCost: {
    type: DataTypes.DECIMAL(15, 4),
    allowNull: true,
    field: 'unit_cost'
  },
  totalCost: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'total_cost'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  // Serial/Lot tracking
  serialNumbers: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    field: 'serial_numbers'
  },
  lotNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'lot_number'
  },
  batchNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'batch_number'
  },
  expiryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expiry_date'
  },
  // Bin location
  fromBinLocation: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'from_bin_location'
  },
  toBinLocation: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'to_bin_location'
  },
  // Reference documents
  referenceType: {
    type: DataTypes.ENUM('purchase_order', 'sales_order', 'transfer', 'adjustment', 'return', 'production', 'other'),
    allowNull: true,
    field: 'reference_type'
  },
  referenceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reference_id',
    comment: 'ID of related PO, SO, Transfer, etc.'
  },
  referenceNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'reference_number'
  },
  // Dates
  movementDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'movement_date'
  },
  effectiveDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'effective_date',
    comment: 'Date when stock level should be affected (for future-dated movements)'
  },
  // Status
  status: {
    type: DataTypes.ENUM('pending', 'completed', 'cancelled', 'reversed'),
    allowNull: false,
    defaultValue: 'completed'
  },
  isReversed: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'is_reversed'
  },
  reversalMovementId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reversal_movement_id',
    comment: 'ID of movement that reversed this one'
  },
  reversedMovementId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'reversed_movement_id',
    comment: 'ID of original movement (if this is a reversal)'
  },
  // User tracking
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by_id'
  },
  approvedById: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'approved_by_id'
  },
  approvedAt: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'approved_at'
  },
  // Notes and metadata
  reason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Reason for movement (especially for adjustments)'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  metadata: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {}
  },
  // Audit trail
  beforeQuantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'before_quantity',
    comment: 'Quantity before movement'
  },
  afterQuantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'after_quantity',
    comment: 'Quantity after movement'
  },
  // Timestamps
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'created_at'
  },
  updatedAt: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'updated_at'
  }
}, {
  tableName: 'stock_movements',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['product_id']
    },
    {
      fields: ['from_location_id']
    },
    {
      fields: ['to_location_id']
    },
    {
      fields: ['type']
    },
    {
      fields: ['movement_date']
    },
    {
      fields: ['status']
    },
    {
      fields: ['reference_type', 'reference_id']
    },
    {
      fields: ['lot_number']
    },
    {
      fields: ['created_by_id']
    }
  ]
});

// Instance methods
StockMovement.prototype.reverse = async function(userId, reason) {
  if (this.isReversed) {
    throw new Error('Movement has already been reversed');
  }

  if (this.status === 'cancelled') {
    throw new Error('Cannot reverse a cancelled movement');
  }

  // Create reversal movement
  const reversalMovement = await StockMovement.create({
    movementNumber: `${this.movementNumber}-REV`,
    productId: this.productId,
    type: this.type,
    fromLocationId: this.toLocationId, // Swap locations
    toLocationId: this.fromLocationId,
    quantity: -this.quantity, // Reverse quantity
    unitCost: this.unitCost,
    totalCost: this.totalCost ? -this.totalCost : null,
    currency: this.currency,
    serialNumbers: this.serialNumbers,
    lotNumber: this.lotNumber,
    batchNumber: this.batchNumber,
    fromBinLocation: this.toBinLocation,
    toBinLocation: this.fromBinLocation,
    referenceType: this.referenceType,
    referenceId: this.referenceId,
    movementDate: new Date(),
    status: 'completed',
    reversedMovementId: this.id,
    createdById: userId,
    reason: `Reversal: ${reason}`
  });

  // Mark this movement as reversed
  await this.update({
    isReversed: true,
    reversalMovementId: reversalMovement.id
  });

  return reversalMovement;
};

module.exports = StockMovement;
