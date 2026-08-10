const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Webhook = sequelize.define('Webhook', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    configurationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'configuration_id',
      references: {
        model: 'payment_configurations',
        key: 'id'
      },
      comment: 'Associated payment configuration if applicable'
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'transaction_id',
      references: {
        model: 'transactions',
        key: 'id'
      },
      comment: 'Associated transaction if applicable'
    },
    provider: {
      type: DataTypes.ENUM('stripe', 'paypal', 'authorizenet'),
      allowNull: false,
      comment: 'Payment gateway provider'
    },
    providerEventId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'provider_event_id',
      unique: true,
      comment: 'Event ID from the payment provider'
    },
    eventType: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'event_type',
      comment: 'Type of webhook event (e.g., payment.succeeded)'
    },
    status: {
      type: DataTypes.ENUM('pending', 'processing', 'processed', 'failed', 'ignored'),
      allowNull: false,
      defaultValue: 'pending',
      comment: 'Processing status of the webhook'
    },
    payload: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Full webhook payload from provider'
    },
    signature: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Webhook signature for verification'
    },
    signatureVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      field: 'signature_verified',
      comment: 'Whether the signature was verified'
    },
    processedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'processed_at',
      comment: 'When the webhook was successfully processed'
    },
    attempts: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      comment: 'Number of processing attempts'
    },
    lastAttemptAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'last_attempt_at',
      comment: 'Last processing attempt timestamp'
    },
    errorMessage: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'error_message',
      comment: 'Error message if processing failed'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional metadata'
    }
  }, {
    tableName: 'webhooks',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['configuration_id']
      },
      {
        fields: ['transaction_id']
      },
      {
        fields: ['provider']
      },
      {
        fields: ['provider_event_id'],
        unique: true
      },
      {
        fields: ['event_type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  Webhook.associate = (models) => {
    Webhook.belongsTo(models.PaymentConfiguration, {
      foreignKey: 'configurationId',
      as: 'configuration'
    });

    Webhook.belongsTo(models.Transaction, {
      foreignKey: 'transactionId',
      as: 'transaction'
    });
  };

  return Webhook;
};
