const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Invoice = sequelize.define('Invoice', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    invoiceNumber: {
      type: DataTypes.STRING(50),
      unique: true,
      allowNull: false,
      comment: 'Human-readable invoice number (e.g., INV-2026-0001)'
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'customers',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    subscriptionId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'subscriptions',
        key: 'id'
      },
      comment: 'Link to subscription if recurring'
    },
    provider: {
      type: DataTypes.ENUM('stripe', 'paypal', 'authorize_net', 'manual'),
      allowNull: false
    },
    providerInvoiceId: {
      type: DataTypes.STRING(255),
      comment: 'External invoice ID from payment provider'
    },
    status: {
      type: DataTypes.ENUM('draft', 'open', 'paid', 'void', 'uncollectible'),
      defaultValue: 'open'
    },
    subtotal: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    tax: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    discount: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    total: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    amountPaid: {
      type: DataTypes.DECIMAL(10, 2),
      defaultValue: 0
    },
    amountDue: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'USD'
    },
    description: {
      type: DataTypes.TEXT
    },
    lineItems: {
      type: DataTypes.JSONB,
      defaultValue: [],
      comment: 'Array of line items with description, quantity, price'
    },
    dueDate: {
      type: DataTypes.DATE,
      allowNull: true
    },
    paidAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    voidedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    sentAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'When invoice was sent to customer'
    },
    pdfUrl: {
      type: DataTypes.TEXT,
      comment: 'URL to generated PDF invoice'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'invoices',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['invoice_number'], unique: true },
      { fields: ['customer_id'] },
      { fields: ['subscription_id'] },
      { fields: ['status'] },
      { fields: ['due_date'] },
      { fields: ['created_at'] }
    ]
  });

  Invoice.associate = (models) => {
    Invoice.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });

    Invoice.belongsTo(models.Subscription, {
      foreignKey: 'subscriptionId',
      as: 'subscription'
    });

    Invoice.hasMany(models.Transaction, {
      foreignKey: 'invoiceId',
      as: 'payments'
    });
  };

  return Invoice;
};
