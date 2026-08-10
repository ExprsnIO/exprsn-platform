module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('webhooks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      configuration_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'payment_configurations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Associated payment configuration if applicable'
      },
      transaction_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'transactions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Associated transaction if applicable'
      },
      provider: {
        type: Sequelize.ENUM('stripe', 'paypal', 'authorizenet'),
        allowNull: false,
        comment: 'Payment gateway provider'
      },
      provider_event_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true,
        comment: 'Event ID from the payment provider'
      },
      event_type: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Type of webhook event (e.g., payment.succeeded)'
      },
      status: {
        type: Sequelize.ENUM('pending', 'processing', 'processed', 'failed', 'ignored'),
        allowNull: false,
        defaultValue: 'pending',
        comment: 'Processing status of the webhook'
      },
      payload: {
        type: Sequelize.JSONB,
        allowNull: false,
        comment: 'Full webhook payload from provider'
      },
      signature: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Webhook signature for verification'
      },
      signature_verified: {
        type: Sequelize.BOOLEAN,
        defaultValue: false,
        comment: 'Whether the signature was verified'
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the webhook was successfully processed'
      },
      attempts: {
        type: Sequelize.INTEGER,
        defaultValue: 0,
        comment: 'Number of processing attempts'
      },
      last_attempt_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Last processing attempt timestamp'
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Error message if processing failed'
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
    await queryInterface.addIndex('webhooks', ['configuration_id']);
    await queryInterface.addIndex('webhooks', ['transaction_id']);
    await queryInterface.addIndex('webhooks', ['provider']);
    await queryInterface.addIndex('webhooks', ['provider_event_id'], { unique: true });
    await queryInterface.addIndex('webhooks', ['event_type']);
    await queryInterface.addIndex('webhooks', ['status']);
    await queryInterface.addIndex('webhooks', ['created_at']);
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('webhooks');
  }
};
