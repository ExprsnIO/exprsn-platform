module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('payment_configurations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'User ID for user-level configuration (null for org-level)'
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Organization ID for org-level configuration (null for user-level)'
      },
      provider: {
        type: Sequelize.ENUM('stripe', 'paypal', 'authorizenet'),
        allowNull: false,
        comment: 'Payment gateway provider'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this configuration is active'
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Primary payment method for this user/org'
      },
      credentials: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Encrypted payment gateway credentials'
      },
      webhook_secret: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Webhook secret for verifying incoming webhooks'
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional provider-specific settings'
      },
      test_mode: {
        type: Sequelize.BOOLEAN,
        defaultValue: true,
        comment: 'Whether this configuration is for test mode'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata'
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
    await queryInterface.addIndex('payment_configurations', ['user_id']);
    await queryInterface.addIndex('payment_configurations', ['organization_id']);
    await queryInterface.addIndex('payment_configurations', ['provider']);
    await queryInterface.addIndex('payment_configurations', ['is_active']);

    // Add unique constraints
    await queryInterface.addConstraint('payment_configurations', {
      fields: ['user_id', 'provider'],
      type: 'unique',
      name: 'unique_user_provider',
      where: {
        organization_id: null
      }
    });

    await queryInterface.addConstraint('payment_configurations', {
      fields: ['organization_id', 'provider'],
      type: 'unique',
      name: 'unique_org_provider',
      where: {
        user_id: null
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('payment_configurations');
  }
};
