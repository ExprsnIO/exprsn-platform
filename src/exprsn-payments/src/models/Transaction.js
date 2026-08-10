const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Transaction = sequelize.define('Transaction', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    configurationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'configuration_id',
      references: {
        model: 'payment_configurations',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      comment: 'User who initiated the transaction'
    },
    customerId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'customer_id',
      references: {
        model: 'customers',
        key: 'id'
      },
      comment: 'Customer record if applicable'
    },
    provider: {
      type: DataTypes.ENUM('stripe', 'paypal', 'authorizenet'),
      allowNull: false,
      comment: 'Payment gateway provider'
    },
    providerTransactionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'provider_transaction_id',
      comment: 'Transaction ID from the payment provider'
    },
    type: {
      type: DataTypes.ENUM('payment', 'refund', 'authorization', 'capture', 'void'),
      allowNull: false,
      defaultValue: 'payment',
      comment: 'Type of transaction'
    },
    status: {
      type: DataTypes.ENUM(
        'pending',
        'processing',
        'succeeded',
        'failed',
        'canceled',
        'refunded',
        'partially_refunded'
      ),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Current status of the transaction'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Transaction amount in smallest currency unit'
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD',
      comment: 'ISO 4217 currency code'
    },
    amountRefunded: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'amount_refunded',
      comment: 'Amount that has been refunded'
    },
    fee: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      comment: 'Processing fee charged by provider'
    },
    netAmount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: true,
      field: 'net_amount',
      comment: 'Net amount after fees'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Transaction description'
    },
    paymentMethod: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'payment_method',
      comment: 'Payment method type (card, bank_transfer, etc.)'
    },
    paymentMethodDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'payment_method_details',
      comment: 'Payment method details (last4, brand, etc.)'
    },
    billingDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'billing_details',
      comment: 'Billing address and contact information'
    },
    shippingDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'shipping_details',
      comment: 'Shipping address and information'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Custom metadata for the transaction'
    },
    errorCode: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'error_code',
      comment: 'Error code if transaction failed'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
      comment: 'Error message if transaction failed'
    },
    providerResponse: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'provider_response',
      comment: 'Full response from payment provider'
    },
    idempotencyKey: {
      type: DataTypes.STRING(255),
      allowNull: true,
      unique: true,
      field: 'idempotency_key',
      comment: 'Idempotency key for duplicate prevention'
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
      comment: 'When the transaction was processed'
    },
    refundedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'refunded_at',
      comment: 'When the transaction was refunded'
    }
  }, {
    tableName: 'transactions',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['configuration_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['customer_id']
      },
      {
        fields: ['provider']
      },
      {
        fields: ['provider_transaction_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['type']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['idempotency_key'],
        unique: true,
        where: {
          idempotency_key: {
            [sequelize.Sequelize.Op.ne]: null
          }
        }
      }
    ]
  });

  Transaction.associate = (models) => {
    Transaction.belongsTo(models.PaymentConfiguration, {
      foreignKey: 'configurationId',
      as: 'configuration'
    });

    Transaction.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });

    Transaction.hasMany(models.Refund, {
      foreignKey: 'transactionId',
      as: 'refunds'
    });

    Transaction.hasMany(models.Webhook, {
      foreignKey: 'transactionId',
      as: 'webhooks'
    });
  };

  return Transaction;
};
