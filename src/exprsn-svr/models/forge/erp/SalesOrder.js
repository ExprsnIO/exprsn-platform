const { DataTypes } = require('sequelize');
const { sequelize } = require('../../../config/database');

const SalesOrder = sequelize.define('SalesOrder', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  orderNumber: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true,
    field: 'order_number'
  },
  customerId: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'customer_id'
  },
  opportunityId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'opportunity_id',
    comment: 'Link to CRM opportunity'
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
    type: DataTypes.ENUM('draft', 'pending_approval', 'approved', 'processing', 'shipped', 'delivered', 'completed', 'cancelled'),
    allowNull: false,
    defaultValue: 'draft'
  },
  fulfillmentStatus: {
    type: DataTypes.ENUM('pending', 'partially_fulfilled', 'fulfilled', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending',
    field: 'fulfillment_status'
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
    comment: 'Array of { productId, sku, name, quantity, unitPrice, discount, tax, total }'
  },
  // Shipping
  shippingMethod: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'shipping_method'
  },
  trackingNumber: {
    type: DataTypes.STRING(255),
    allowNull: true,
    field: 'tracking_number'
  },
  shippingAddress: {
    type: DataTypes.JSONB,
    allowNull: false,
    field: 'shipping_address',
    comment: '{ line1, line2, city, state, postalCode, country }'
  },
  billingAddress: {
    type: DataTypes.JSONB,
    allowNull: false,
    field: 'billing_address'
  },
  // Payment
  paymentMethod: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'payment_method'
  },
  paymentStatus: {
    type: DataTypes.ENUM('pending', 'partially_paid', 'paid', 'refunded'),
    allowNull: false,
    defaultValue: 'pending',
    field: 'payment_status'
  },
  paymentTerms: {
    type: DataTypes.STRING(100),
    allowNull: true,
    field: 'payment_terms'
  },
  // Ownership
  salesRepId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'sales_rep_id'
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false,
    field: 'created_by_id'
  },
  // Invoice integration
  invoiceIds: {
    type: DataTypes.ARRAY(DataTypes.UUID),
    allowNull: true,
    field: 'invoice_ids',
    comment: 'Generated invoices'
  },
  // Workflow integration
  onApproveWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_approve_workflow_id'
  },
  onShipWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_ship_workflow_id'
  },
  onDeliverWorkflowId: {
    type: DataTypes.UUID,
    allowNull: true,
    field: 'on_deliver_workflow_id'
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
  tableName: 'sales_orders',
  timestamps: true,
  underscored: true,
  indexes: [
    {
      fields: ['order_number'],
      unique: true
    },
    {
      fields: ['customer_id']
    },
    {
      fields: ['opportunity_id']
    },
    {
      fields: ['status']
    },
    {
      fields: ['fulfillment_status']
    },
    {
      fields: ['payment_status']
    },
    {
      fields: ['sales_rep_id']
    },
    {
      fields: ['order_date']
    }
  ]
});

module.exports = SalesOrder;
