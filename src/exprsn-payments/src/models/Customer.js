const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Customer = sequelize.define('Customer', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      comment: 'User who owns this customer record'
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_id',
      comment: 'Organization if applicable'
    },
    provider: {
      type: DataTypes.ENUM('stripe', 'paypal', 'authorizenet'),
      allowNull: false,
      comment: 'Payment gateway provider'
    },
    providerCustomerId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'provider_customer_id',
      comment: 'Customer ID from the payment provider'
    },
    email: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        isEmail: true
      },
      comment: 'Customer email address'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Customer full name'
    },
    phone: {
      type: DataTypes.STRING(50),
      allowNull: true,
      comment: 'Customer phone number'
    },
    defaultPaymentMethod: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'default_payment_method',
      comment: 'Default payment method ID from provider'
    },
    paymentMethods: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      field: 'payment_methods',
      comment: 'List of payment methods (cards, bank accounts, etc.)'
    },
    billingDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'billing_details',
      comment: 'Default billing address and details'
    },
    shippingDetails: {
      type: DataTypes.JSONB,
      allowNull: true,
      field: 'shipping_details',
      comment: 'Default shipping address and details'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
      comment: 'Additional metadata'
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      field: 'is_active',
      comment: 'Whether this customer record is active'
    }
  }, {
    tableName: 'customers',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['user_id']
      },
      {
        fields: ['organization_id']
      },
      {
        fields: ['provider']
      },
      {
        fields: ['provider_customer_id']
      },
      {
        fields: ['email']
      },
      {
        unique: true,
        fields: ['user_id', 'provider'],
        name: 'unique_user_provider_customer'
      }
    ]
  });

  Customer.associate = (models) => {
    Customer.hasMany(models.Transaction, {
      foreignKey: 'customerId',
      as: 'transactions'
    });
  };

  return Customer;
};
