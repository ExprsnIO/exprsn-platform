const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Inventory = sequelize.define('Inventory', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  productId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'product_id'
  },
  locationId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'location_id',
    comment: 'Warehouse/location ID'
  },
  // Quantities
  quantityOnHand: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'quantity_on_hand'
  },
  quantityReserved: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'quantity_reserved',
    comment: 'Reserved for pending orders'
  },
  quantityAvailable: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'quantity_available',
    comment: 'On hand minus reserved'
  },
  quantityOnOrder: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
    field: 'quantity_on_order',
    comment: 'Ordered from suppliers'
  },
  // Reorder management
  reorderPoint: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'reorder_point'
  },
  reorderQuantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'reorder_quantity'
  },
  maxStock: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'max_stock'
  },
  minStock: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'min_stock'
  },
  reorderStatus: {
    type: DataTypes.ENUM('normal', 'low_stock', 'reorder_needed', 'critical', 'overstock'),
    allowNull: false,
    defaultValue: 'normal',
    field: 'reorder_status'
  },
  autoReorder: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    field: 'auto_reorder'
  },
  lastReorderDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_reorder_date'
  },
  // Costing
  costingMethod: {
    type: DataTypes.ENUM('fifo', 'lifo', 'average', 'standard'),
    allowNull: false,
    defaultValue: 'fifo',
    field: 'costing_method'
  },
  averageCost: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'average_cost'
  },
  lastCost: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'last_cost'
  },
  standardCost: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'standard_cost'
  },
  totalValue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'total_value',
    comment: 'Current inventory value'
  },
  // Serial/Lot tracking
  trackingMethod: {
    type: DataTypes.ENUM('none', 'serial', 'lot', 'batch'),
    allowNull: false,
    defaultValue: 'none',
    field: 'tracking_method'
  },
  serialNumbers: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'serial_numbers',
    comment: 'Array of { serial, status, receivedDate }'
  },
  lotNumbers: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'lot_numbers',
    comment: 'Array of { lot, quantity, expiryDate }'
  },
  // Dates
  lastStockCheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_stock_check_date'
  },
  lastMovementDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_movement_date'
  },
  nextStockCheckDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'next_stock_check_date'
  },
  // Bin/location tracking
  binLocation: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'bin_location'
  },
  aisle: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  shelf: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  // Status
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'discontinued'),
    allowNull: false,
    defaultValue: 'active'
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  },
  // Workflow integration
  onLowStockWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_low_stock_workflow_id'
  },
  onReorderWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_reorder_workflow_id'
  },
  onStockOutWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_stock_out_workflow_id'
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
  tableName: 'inventory',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['product_id', 'location_id'],
      unique: true
    },
    {
      fields: ['product_id']
    },
    {
      fields: ['location_id']
    },
    {
      fields: ['reorder_status']
    },
    {
      fields: ['status']
    }
  ]
});

module.exports = Inventory;
