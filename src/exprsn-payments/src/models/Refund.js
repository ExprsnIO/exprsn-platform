const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Refund = sequelize.define('Refund', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'transaction_id',
      references: {
        model: 'transactions',
        key: 'id'
      },
      comment: 'Original transaction being refunded'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      comment: 'User who initiated the refund'
    },
    provider: {
      type: DataTypes.ENUM('stripe', 'paypal', 'authorizenet'),
      allowNull: false,
      comment: 'Payment gateway provider'
    },
    providerRefundId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'provider_refund_id',
      comment: 'Refund ID from the payment provider'
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'succeeded', 'failed', 'canceled'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Current status of the refund'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Refund amount'
    },
    currency: {
      type: DataTypes.STRING(3),
      allowNull: false,
      defaultValue: 'USD',
      comment: 'ISO 4217 currency code'
    },
    reason: {
      type: DataTypes.ENUM(
        'duplicate',
        'fraudulent',
        'requested_by_customer',
        'other'
      ),
      allowNull: true,
      comment: 'Reason for the refund'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Detailed description or notes about the refund'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional metadata'
    },
    errorCode: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'error_code',
      comment: 'Error code if refund failed'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
      comment: 'Error message if refund failed'
    },
    providerResponse: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'provider_response',
      comment: 'Full response from payment provider'
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
      comment: 'When the refund was processed'
    }
  }, {
    tableName: 'refunds',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['transaction_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['provider']
      },
      {
        fields: ['provider_refund_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  Refund.associate = (models) => {
    Refund.belongsTo(models.Transaction, {
      foreignKey: 'transactionId',
      as: 'transaction'
    });
  };

  return Refund;
};
