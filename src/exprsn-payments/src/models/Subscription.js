const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Subscription = sequelize.define('Subscription', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
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
    planId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Plan identifier (e.g., basic, premium, enterprise)'
    },
    provider: {
      type: DataTypes.ENUM('stripe', 'paypal', 'authorize_net'),
      allowNull: false
    },
    providerSubscriptionId: {
      type: DataTypes.STRING(255),
      unique: true,
      comment: 'External subscription ID from payment provider'
    },
    status: {
      type: DataTypes.ENUM(
        'active',
        'trialing',
        'past_due',
        'canceled',
        'unpaid',
        'incomplete',
        'incomplete_expired',
        'paused'
      ),
      defaultValue: 'incomplete'
    },
    billingCycle: {
      type: DataTypes.ENUM('monthly', 'quarterly', 'yearly', 'biannual'),
      allowNull: false,
      defaultValue: 'monthly'
    },
    amount: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      comment: 'Subscription amount per billing cycle'
    },
    currency: {
      type: DataTypes.STRING(3),
      defaultValue: 'USD'
    },
    quantity: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      comment: 'Number of units (seats, licenses, etc.)'
    },
    trialEndsAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Trial period end date'
    },
    currentPeriodStart: {
      type: DataTypes.DATE,
      allowNull: true
    },
    currentPeriodEnd: {
      type: DataTypes.DATE,
      allowNull: true
    },
    canceledAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    cancelAtPeriodEnd: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    endedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {}
    }
  }, {
    tableName: 'subscriptions',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['customer_id'] },
      { fields: ['provider', 'provider_subscription_id'] },
      { fields: ['status'] },
      { fields: ['current_period_end'] }
    ]
  });

  Subscription.associate = (models) => {
    Subscription.belongsTo(models.Customer, {
      foreignKey: 'customerId',
      as: 'customer'
    });

    Subscription.hasMany(models.Invoice, {
      foreignKey: 'subscriptionId',
      as: 'invoices'
    });
  };

  return Subscription;
};
