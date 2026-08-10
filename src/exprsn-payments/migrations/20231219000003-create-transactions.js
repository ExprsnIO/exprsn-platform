module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('transactions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      configuration_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'payment_configurations',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User who initiated the transaction'
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Customer record if applicable'
      },
      provider: {
        type: Sequelize.ENUM('stripe', 'paypal', 'authorizenet'),
        allowNull: false,
        comment: 'Payment gateway provider'
      },
      provider_transaction_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Transaction ID from the payment provider'
      },
      type: {
        type: Sequelize.ENUM('payment', 'refund', 'authorization', 'capture', 'void'),
        allowNull: false,
        defaultValue: 'payment',
        comment: 'Type of transaction'
      },
      status: {
        type: Sequelize.ENUM(
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
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Transaction amount'
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD',
        comment: 'ISO 4217 currency code'
      },
      amount_refunded: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Amount that has been refunded'
      },
      fee: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Processing fee charged by provider'
      },
      net_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
        comment: 'Net amount after fees'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Transaction description'
      },
      payment_method: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'Payment method type (card, bank_transfer, etc.)'
      },
      payment_method_details: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Payment method details (last4, brand, etc.)'
      },
      billing_details: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Billing address and contact information'
      },
      shipping_details: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Shipping address and information'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Custom metadata for the transaction'
      },
      error_code: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Error code if transaction failed'
      },
      error_message: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Error message if transaction failed'
      },
      provider_response: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Full response from payment provider'
      },
      idempotency_key: {
        type: Sequelize.STRING(255),
        allowNull: true,
        unique: true,
        comment: 'Idempotency key for duplicate prevention'
      },
      processed_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the transaction was processed'
      },
      refunded_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the transaction was refunded'
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
    await queryInterface.addIndex('transactions', ['configuration_id']);
    await queryInterface.addIndex('transactions', ['user_id']);
    await queryInterface.addIndex('transactions', ['customer_id']);
    await queryInterface.addIndex('transactions', ['provider']);
    await queryInterface.addIndex('transactions', ['provider_transaction_id']);
    await queryInterface.addIndex('transactions', ['status']);
    await queryInterface.addIndex('transactions', ['type']);
    await queryInterface.addIndex('transactions', ['created_at']);
    await queryInterface.addIndex('transactions', ['idempotency_key'], {
      unique: true,
      where: {
        idempotency_key: {
          [Sequelize.Op.ne]: null
        }
      }
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('transactions');
  }
};
