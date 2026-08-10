/**
 * Migration: Create Customers, Suppliers, and Invoices tables
 *
 * These are core ERP tables that are referenced by later migrations.
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // ============================================
    // CUSTOMERS TABLE
    // ============================================

    await queryInterface.createTable('customers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      customer_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      contact_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Link to CRM Contact'
      },
      billing_address: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      shipping_address: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      payment_terms: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      credit_limit: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      tax_exempt: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'suspended'),
        allowNull: false,
        defaultValue: 'active'
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // Add indexes for customers
    await queryInterface.addIndex('customers', ['customer_number'], {
      name: 'customers_customer_number_unique',
      unique: true
    });
    await queryInterface.addIndex('customers', ['email'], {
      name: 'customers_email_idx'
    });
    await queryInterface.addIndex('customers', ['contact_id'], {
      name: 'customers_contact_id_idx'
    });
    await queryInterface.addIndex('customers', ['status'], {
      name: 'customers_status_idx'
    });

    // ============================================
    // SUPPLIERS TABLE
    // ============================================

    await queryInterface.createTable('suppliers', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      supplier_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      legal_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      phone: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      fax: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      website: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      billing_address: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      shipping_address: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      tax_id: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      business_type: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      industry: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      payment_terms: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      payment_method: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      credit_limit: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      primary_contact_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Link to CRM Contact'
      },
      accounts_payable_contact_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'suspended', 'archived'),
        allowNull: false,
        defaultValue: 'active'
      },
      is_preferred: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      rating: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: '1-5 rating'
      },
      on_time_delivery_rate: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true,
        comment: 'Percentage'
      },
      quality_score: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true
      },
      total_orders_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_orders_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      last_order_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      average_lead_time_days: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      minimum_order_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      certifications: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Array of { name, issuedBy, expiryDate }'
      },
      insurance_provider: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      insurance_policy_number: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      insurance_expiry_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      bank_details: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: '{ bankName, accountNumber, routingNumber, swift }'
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      custom_fields: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // Add indexes for suppliers
    await queryInterface.addIndex('suppliers', ['supplier_number'], {
      name: 'suppliers_supplier_number_unique',
      unique: true
    });
    await queryInterface.addIndex('suppliers', ['name'], {
      name: 'suppliers_name_idx'
    });
    await queryInterface.addIndex('suppliers', ['status'], {
      name: 'suppliers_status_idx'
    });
    await queryInterface.addIndex('suppliers', ['is_preferred'], {
      name: 'suppliers_is_preferred_idx'
    });
    await queryInterface.addIndex('suppliers', ['primary_contact_id'], {
      name: 'suppliers_primary_contact_id_idx'
    });

    // ============================================
    // INVOICES TABLE
    // ============================================

    await queryInterface.createTable('invoices', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      invoice_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      invoice_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      due_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('draft', 'sent', 'paid', 'overdue', 'cancelled', 'refunded'),
        allowNull: false,
        defaultValue: 'draft'
      },
      subtotal: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      tax_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      discount_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      total: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      amount_paid: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      amount_due: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      terms: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      paid_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      line_items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: []
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // Add indexes for invoices
    await queryInterface.addIndex('invoices', ['invoice_number'], {
      name: 'invoices_invoice_number_unique',
      unique: true
    });
    await queryInterface.addIndex('invoices', ['customer_id'], {
      name: 'invoices_customer_id_idx'
    });
    await queryInterface.addIndex('invoices', ['status'], {
      name: 'invoices_status_idx'
    });
    await queryInterface.addIndex('invoices', ['invoice_date'], {
      name: 'invoices_invoice_date_idx'
    });
    await queryInterface.addIndex('invoices', ['due_date'], {
      name: 'invoices_due_date_idx'
    });

    console.log('✅ Created customers, suppliers, and invoices tables');
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order (respecting foreign keys)
    await queryInterface.dropTable('invoices');
    await queryInterface.dropTable('suppliers');
    await queryInterface.dropTable('customers');

    // Drop ENUM types
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_customers_status CASCADE;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_suppliers_status CASCADE;');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS enum_invoices_status CASCADE;');

    console.log('✅ Dropped customers, suppliers, and invoices tables');
  }
};
