const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  sku: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  type: {
    type: DataTypes.ENUM('product', 'service'),
    allowNull: false,
    defaultValue: 'product'
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive', 'discontinued'),
    allowNull: false,
    defaultValue: 'active'
  },
  unitPrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'unit_price'
  },
  costPrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'cost_price'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  taxable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  stockQuantity: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
    field: 'stock_quantity'
  },
  reorderPoint: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'reorder_point'
  },
  unit: {
    type: DataTypes.STRING(50),
    allowNull: true
  },
  barcode: {
    type: DataTypes.STRING(100),
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
  tableName: 'products',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['sku'],
      unique: true
    },
    {
      fields: ['category']
    },
    {
      fields: ['status']
    },
    {
      fields: ['type']
    }
  ]
});

module.exports = Product;
