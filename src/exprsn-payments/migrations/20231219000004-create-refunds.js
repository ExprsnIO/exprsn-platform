module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('refunds', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      transaction_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'transactions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'Original transaction being refunded'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User who initiated the refund'
      },
      provider: {
        type: Sequelize.ENUM('stripe', 'paypal', 'authorizenet'),
        allowNull: false,
        comment: 'Payment gateway provider'
      },
      provider_refund_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Refund ID from the payment provider'
      },
      status: {
        type: Sequelize.ENUM('pending', 'processing', 'succeeded', 'failed', 'canceled'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Current status of the refund'
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Refund amount'
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD',
        comment: 'ISO 4217 currency code'
      },
      reason: {
        type: Sequelize.ENUM(
          'duplicate',
          'fraudulent',
          'requested_by_customer',
          'other'
        ),
        allowNull: true,
        comment: 'Reason for the refund'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Detailed description or notes about the refund'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional metadata'
      },
      error_code: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Error code if refund failed'
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Error message if refund failed'
      },
      provider_response: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Full response from payment provider'
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the refund was processed'
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
    await queryInterface.addIndex('refunds', ['transaction_id']);
    await queryInterface.addIndex('refunds', ['user_id']);
    await queryInterface.addIndex('refunds', ['provider']);
    await queryInterface.addIndex('refunds', ['provider_refund_id']);
    await queryInterface.addIndex('refunds', ['status']);
    await queryInterface.addIndex('refunds', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('refunds');
  }
};
