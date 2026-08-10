module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('invoices', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      invoice_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'Human-readable invoice number (e.g., INV-2026-0001)'
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
      subscription_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'subscriptions',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Associated subscription if recurring'
      },
      provider: {
        type: Sequelize.ENUM('stripe', 'paypal', 'authorize_net'),
        allowNull: false
      },
      provider_invoice_id: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Invoice ID from payment provider'
      },
      status: {
        type: Sequelize.ENUM('draft', 'open', 'paid', 'void', 'uncollectible'),
        allowNull: false,
        defaultValue: 'open'
      },
      subtotal: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Subtotal before tax and discounts'
      },
      tax: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Tax amount'
      },
      discount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Discount amount'
      },
      total: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Total amount (subtotal + tax - discount)'
      },
      amount_paid: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Amount already paid'
      },
      amount_due: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Amount remaining to be paid'
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Invoice description or notes'
      },
      line_items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: [],
        comment: 'Array of line items with description, quantity, unitPrice, total'
      },
      due_date: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Payment due date'
      },
      paid_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date invoice was fully paid'
      },
      voided_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date invoice was voided'
      },
      sent_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'Date invoice was sent to customer'
      },
      pdf_url: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'URL to PDF invoice'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {},
        comment: 'Additional invoice metadata'
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
    await queryInterface.addIndex('invoices', ['invoice_number'], {
      name: 'invoices_invoice_number_idx',
      unique: true
    });

    await queryInterface.addIndex('invoices', ['customer_id'], {
      name: 'invoices_customer_id_idx'
    });

    await queryInterface.addIndex('invoices', ['subscription_id'], {
      name: 'invoices_subscription_id_idx'
    });

    await queryInterface.addIndex('invoices', ['provider'], {
      name: 'invoices_provider_idx'
    });

    await queryInterface.addIndex('invoices', ['status'], {
      name: 'invoices_status_idx'
    });

    await queryInterface.addIndex('invoices', ['due_date'], {
      name: 'invoices_due_date_idx'
    });

    await queryInterface.addIndex('invoices', ['created_at'], {
      name: 'invoices_created_at_idx'
    });

    // Composite index for common queries
    await queryInterface.addIndex('invoices', ['customer_id', 'status'], {
      name: 'invoices_customer_status_idx'
    });
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('invoices');
  }
};
