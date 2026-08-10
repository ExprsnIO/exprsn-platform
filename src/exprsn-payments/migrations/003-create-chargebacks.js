module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('chargebacks', {
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
        onDelete: 'CASCADE'
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      invoice_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'invoices',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Associated invoice if applicable'
      },
      provider: {
        type: Sequelize.ENUM('stripe', 'paypal', 'authorize_net'),
        allowNull: false
      },
      provider_chargeback_id: {
        type: Sequelize.STRING(255),
        allowNull: false,
        unique: true,
        comment: 'Dispute/chargeback ID from payment provider'
      },
      status: {
        type: Sequelize.ENUM(
          'warning_needs_response',
          'warning_under_review',
          'warning_closed',
          'needs_response',
          'under_review',
          'won',
          'lost',
          'charge_refunded'
        ),
        allowNull: false,
        defaultValue: 'warning_needs_response'
      },
      reason: {
        type: Sequelize.ENUM(
          'fraudulent',
          'duplicate',
          'product_not_received',
          'product_unacceptable',
          'subscription_canceled',
          'credit_not_processed',
          'general',
          'other'
        ),
        allowNull: false,
        comment: 'Reason for chargeback'
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        comment: 'Disputed amount'
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      evidence: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Evidence submitted for dispute (docs, communication, etc.)'
      },
      evidence_submitted_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date evidence was submitted to provider'
      },
      respond_by_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Deadline to respond to dispute'
      },
      resolved_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date dispute was resolved (won or lost)'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional chargeback metadata'
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Indexes for performance
    await queryInterface.addIndex('chargebacks', ['transaction_id'], {
      name: 'chargebacks_transaction_id_idx'
    });

    await queryInterface.addIndex('chargebacks', ['customer_id'], {
      name: 'chargebacks_customer_id_idx'
    });

    await queryInterface.addIndex('chargebacks', ['invoice_id'], {
      name: 'chargebacks_invoice_id_idx'
    });

    await queryInterface.addIndex('chargebacks', ['provider'], {
      name: 'chargebacks_provider_idx'
    });

    await queryInterface.addIndex('chargebacks', ['provider_chargeback_id'], {
      name: 'chargebacks_provider_chargeback_id_idx',
      unique: true
    });

    await queryInterface.addIndex('chargebacks', ['status'], {
      name: 'chargebacks_status_idx'
    });

    await queryInterface.addIndex('chargebacks', ['reason'], {
      name: 'chargebacks_reason_idx'
    });

    await queryInterface.addIndex('chargebacks', ['respond_by_date'], {
      name: 'chargebacks_respond_by_date_idx'
    });

    await queryInterface.addIndex('chargebacks', ['created_at'], {
      name: 'chargebacks_created_at_idx'
    });

    // Composite indexes for common queries
    await queryInterface.addIndex('chargebacks', ['customer_id', 'status'], {
      name: 'chargebacks_customer_status_idx'
    });

    await queryInterface.addIndex('chargebacks', ['status', 'respond_by_date'], {
      name: 'chargebacks_status_respond_by_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('chargebacks');
  }
};
