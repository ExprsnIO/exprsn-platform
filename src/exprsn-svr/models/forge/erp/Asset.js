const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const Asset = sequelize.define('Asset', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  assetNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'asset_number'
  },
  assetName: {
    type: DataTypes.STRING(255),
    allowNull: false,
    field: 'asset_name'
  },
  // Classification
  assetType: {
    type: DataTypes.ENUM('equipment', 'vehicle', 'furniture', 'computer', 'software', 'building', 'land', 'leasehold_improvement', 'other'),
    allowNull: false,
    field: 'asset_type'
  },
  category: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  // Identification
  serialNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'serial_number'
  },
  model: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  manufacturer: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  // Financial information
  purchaseDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'purchase_date'
  },
  purchasePrice: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'purchase_price'
  },
  currentValue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    field: 'current_value'
  },
  salvageValue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'salvage_value',
    comment: 'Estimated value at end of useful life'
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  // Depreciation
  depreciationMethod: {
    type: DataTypes.ENUM('straight_line', 'declining_balance', 'sum_of_years_digits', 'units_of_production', 'none'),
    allowNull: false,
    defaultValue: 'straight_line',
    field: 'depreciation_method'
  },
  usefulLifeYears: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'useful_life_years'
  },
  usefulLifeUnits: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'useful_life_units',
    comment: 'For units of production method'
  },
  accumulatedDepreciation: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'accumulated_depreciation'
  },
  lastDepreciationDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_depreciation_date'
  },
  // Accounting
  assetAccountId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'asset_account_id'
  },
  depreciationAccountId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'depreciation_account_id'
  },
  expenseAccountId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'expense_account_id'
  },
  // Location and assignment
  location: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  departmentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'department_id'
  },
  assignedToEmployeeId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'assigned_to_employee_id'
  },
  assignedDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'assigned_date'
  },
  // Status
  status: {
    type: DataTypes.ENUM('active', 'in_use', 'in_storage', 'under_maintenance', 'retired', 'sold', 'disposed', 'lost', 'stolen'),
    allowNull: false,
    defaultValue: 'active'
  },
  condition: {
    type: DataTypes.ENUM('excellent', 'good', 'fair', 'poor', 'broken'),
    allowNull: true
  },
  // Disposal
  disposalDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'disposal_date'
  },
  disposalMethod: {
    type: DataTypes.ENUM('sold', 'donated', 'scrapped', 'returned', 'traded', 'other'),
    allowNull: true,
    field: 'disposal_method'
  },
  disposalValue: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: true,
    field: 'disposal_value'
  },
  disposalNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'disposal_notes'
  },
  // Warranty
  warrantyStartDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'warranty_start_date'
  },
  warrantyEndDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'warranty_end_date'
  },
  warrantyProvider: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'warranty_provider'
  },
  warrantyNotes: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'warranty_notes'
  },
  // Insurance
  insured: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false
  },
  insuranceProvider: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'insurance_provider'
  },
  insurancePolicyNumber: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'insurance_policy_number'
  },
  insuranceExpiryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'insurance_expiry_date'
  },
  // Supplier information
  supplierId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'supplier_id'
  },
  purchaseOrderId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'purchase_order_id'
  },
  invoiceId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'invoice_id'
  },
  // Maintenance
  lastMaintenanceDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'last_maintenance_date'
  },
  nextMaintenanceDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'next_maintenance_date'
  },
  maintenanceScheduleId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'maintenance_schedule_id'
  },
  // Documents
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  images: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { url, caption, uploadedAt }'
  },
  documents: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Array of { type, url, fileName, uploadedAt }'
  },
  // Custom fields
  specifications: {
    type: DataTypes.JSONB,
    allowNull: true,
    comment: 'Custom specifications and technical details'
  },
  customFields: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    field: 'custom_fields'
  },
  // Metadata
  barcode: {
    type: DataTypes.STRING(100),
    allowNull: true
  },
  rfidTag: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'rfid_tag'
  },
  qrCode: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'qr_code'
  },
  tags: {
    type: DataTypes.ARRAY(DataTypes.STRING),
    allowNull: true,
    defaultValue: []
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
  tableName: 'assets',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['asset_number'],
      unique: true
    },
    {
      fields: ['asset_type']
    },
    {
      fields: ['status']
    },
    {
      fields: ['serial_number']
    },
    {
      fields: ['department_id']
    },
    {
      fields: ['assigned_to_employee_id']
    },
    {
      fields: ['supplier_id']
    },
    {
      fields: ['barcode']
    },
    {
      fields: ['purchase_date']
    }
  ]
});

module.exports = Asset;
