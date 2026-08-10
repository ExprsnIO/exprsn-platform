const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const PurchaseOrder = sequelize.define('PurchaseOrder', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  poNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'po_number'
  },
  supplierId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'supplier_id'
  },
  // Dates
  orderDate: {
    type: DataTypes.DATE,
    allowNull: false,
    field: 'order_date'
  },
  requestedDeliveryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'requested_delivery_date'
  },
  expectedDeliveryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'expected_delivery_date'
  },
  actualDeliveryDate: {
    type: DataTypes.DATE,
    allowNull: true,
    field: 'actual_delivery_date'
  },
  // Status
  status: {
    type: DataTypes.ENUM('draft', 'pending_approval', 'approved', 'sent', 'partially_received', 'received', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'draft'
  },
  approvalStatus: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected'),
    allowNull: true,
    field: 'approval_status'
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
  // Financial
  subtotal: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0
  },
  taxAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'tax_amount'
  },
  shippingAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'shipping_amount'
  },
  discountAmount: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false,
    defaultValue: 0,
    field: 'discount_amount'
  },
  total: {
    type: DataTypes.DECIMAL(15, 2),
    allowNull: false
  },
  currency: {
    type: DataTypes.STRING(3),
    allowNull: false,
    defaultValue: 'USD'
  },
  // Line items
  lineItems: {
    type: DataTypes.JSONB,
    allowNull: false,
    defaultValue: [],
    field: 'line_items',
    comment: 'Array of { productId, sku, name, quantity, unitPrice, quantityReceived, receivedDate }'
  },
  // Delivery
  deliveryAddress: {
    type: DataTypes.JSONB,
    allowNull: false,
    field: 'delivery_address'
  },
  deliveryInstructions: {
    type: DataTypes.TEXT,
    allowNull: true,
    field: 'delivery_instructions'
  },
  // Payment
  paymentTerms: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'payment_terms'
  },
  paymentMethod: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'payment_method'
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'partially_paid', 'paid'),
    allowNull: false,
    defaultValue: 'pending',
    field: 'payment_status'
  },
  // Ownership
  buyerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'buyer_id'
  },
  departmentId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'department_id'
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by_id'
  },
  // Approval workflow
  approvalChain: {
    type: DataTypes.JSONB,
    allowNull: true,
    field: 'approval_chain',
    comment: 'Array of { userId, level, status, approvedAt }'
  },
  currentApprovalLevel: {
    type: DataTypes.INTEGER,
    allowNull: true,
    field: 'current_approval_level'
  },
  // Workflow integration
  onApproveWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_approve_workflow_id'
  },
  onReceiveWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_receive_workflow_id'
  },
  notes: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  customFields: {
    type: DataTypes.JSONB,
    allowNull: true,
    defaultValue: {},
    field: 'custom_fields'
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
  tableName: 'purchase_orders',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['po_number'],
      unique: true
    },
    {
      fields: ['supplier_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['approval_status']
    },
    {
      fields: ['buyer_id']
    },
    {
      fields: ['department_id']
    },
    {
      fields: ['order_date']
    }
  ]
});

module.exports = PurchaseOrder;
