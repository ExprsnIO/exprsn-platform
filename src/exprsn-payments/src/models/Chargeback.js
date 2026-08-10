const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Chargeback = sequelize.define('Chargeback', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    transactionId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'transactions',
        key: 'id'
      },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    },
    provider: {
      type: DataTypes.ENUM('stripe', 'paypal', 'authorize_net'),
      allowNull: false
    },
    providerChargebackId: {
      type: DataTypes.STRING(255),
      comment: 'External chargeback/dispute ID'
    },
    status: {
      type: DataTypes.ENUM(
        'warning_needs_response',
        'warning_under_review',
        'warning_closed',
        'needs_response',
        'under_review',
        'charge_refunded',
        'won',
        'lost'
      ),
      defaultValue: 'needs_response'
    },
    reason: {
      type: DataTypes.ENUM(
        'fraudulent',
        'duplicate',
        'subscription_canceled',
        'product_unacceptable',
        'product_not_received',
        'unrecognized',
        'credit_not_processed',
        'general'
      ),
      allowNull: false
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Disputed amount'
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'USD'
    },
    isRefundable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },
    evidence: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Evidence submitted to dispute the chargeback'
    },
    evidenceDetails: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Metadata about evidence submission'
    },
    respondByDate: {
      type: DataTypes.DATE,
      comment: 'Deadline to respond to chargeback'
    },
    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    resolution: {
      type: DataTypes.TEXT,
      comment: 'Notes on how the chargeback was resolved'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'chargebacks',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['transaction_id'] },
      { fields: ['provider', 'provider_chargeback_id'] },
      { fields: ['status'] },
      { fields: ['respond_by_date'] }
    ]
  });

  Chargeback.associate = (models) => {
    Chargeback.belongsTo(models.Transaction, {
      foreignKey: 'transactionId',
      as: 'transaction'
    });
  };

  return Chargeback;
};
