module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('customers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User who owns this customer record'
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Organization if applicable'
      },
      provider: {
        type: Sequelize.ENUM('stripe', 'paypal', 'authorizenet'),
        allowNull: false,
        comment: 'Payment gateway provider'
      },
      provider_customer_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Customer ID from the payment provider'
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false,
        comment: 'Customer email address'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Customer full name'
      },
      phone: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Customer phone number'
      },
      default_payment_method: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Default payment method ID from provider'
      },
      payment_methods: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'List of payment methods (cards, bank accounts, etc.)'
      },
      billing_details: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Default billing address and details'
      },
      shipping_details: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Default shipping address and details'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this customer record is active'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    // Add indexes
    await queryInterface.addIndex('customers', ['user_id']);
    await queryInterface.addIndex('customers', ['organization_id']);
    await queryInterface.addIndex('customers', ['provider']);
    await queryInterface.addIndex('customers', ['provider_customer_id']);
    await queryInterface.addIndex('customers', ['email']);

    // Add unique constraint
    await queryInterface.addConstraint('customers', {
      fields: ['user_id', 'provider'],
      type: 'unique',
      name: 'unique_user_provider_customer'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('customers');
  }
};
