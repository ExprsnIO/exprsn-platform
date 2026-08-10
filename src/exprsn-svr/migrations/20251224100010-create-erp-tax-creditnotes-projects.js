/**
 * Migration: ERP Tax Management, Credit Notes, and Enhanced Features
 *
 * Adds:
 * - Tax Rates with jurisdiction support
 * - Tax Exemptions
 * - Credit Notes
 * - Enhanced Payment model fields
 * - Enhanced JournalEntry model fields
 * - Enhanced Account model fields
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // ============================================
    // TAX RATES
    // ============================================

    await queryInterface.createTable('tax_rates', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      tax_type: {
        type: Sequelize.ENUM('sales', 'purchase', 'both', 'withholding', 'service', 'excise'),
        allowNull: false,
        defaultValue: 'sales'
      },
      rate: {
        type: Sequelize.DECIMAL(8, 4),
        allowNull: false
      },
      rate_type: {
        type: Sequelize.ENUM('percentage', 'fixed'),
        allowNull: false,
        defaultValue: 'percentage'
      },
      country: {
        type: Sequelize.STRING(2),
        allowNull: true
      },
      state: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      jurisdiction: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      is_compound: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      components: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      applicable_on: {
        type: Sequelize.ENUM('subtotal', 'subtotal_with_discount', 'line_item'),
        allowNull: false,
        defaultValue: 'subtotal'
      },
      included_in_price: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      effective_from: {
        type: Sequelize.DATE,
        allowNull: true
      },
      effective_to: {
        type: Sequelize.DATE,
        allowNull: true
      },
      account_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'accounts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      recoverable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      reporting_category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      rules: {
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

    // Add indexes for tax_rates
    await queryInterface.addIndex('tax_rates', ['code'], {
      unique: true,
      name: 'tax_rates_code_unique_idx'
    });
    await queryInterface.addIndex('tax_rates', ['is_active']);
    await queryInterface.addIndex('tax_rates', ['tax_type']);
    await queryInterface.addIndex('tax_rates', ['country', 'state']);
    await queryInterface.addIndex('tax_rates', ['effective_from', 'effective_to']);
    await queryInterface.addIndex('tax_rates', ['priority']);

    // ============================================
    // TAX EXEMPTIONS
    // ============================================

    await queryInterface.createTable('tax_exemptions', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      exemption_number: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true
      },
      entity_type: {
        type: Sequelize.ENUM('customer', 'product', 'transaction', 'category'),
        allowNull: false
      },
      entity_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      exemption_type: {
        type: Sequelize.ENUM('full', 'partial', 'specific_tax'),
        allowNull: false,
        defaultValue: 'full'
      },
      tax_rate_ids: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true
      },
      reason: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      certificate_number: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      issuing_authority: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      country: {
        type: Sequelize.STRING(2),
        allowNull: true
      },
      state: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      effective_from: {
        type: Sequelize.DATE,
        allowNull: false
      },
      effective_to: {
        type: Sequelize.DATE,
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      auto_renew: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      attachments: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      conditions: {
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

    // Add indexes for tax_exemptions
    await queryInterface.addIndex('tax_exemptions', ['exemption_number'], {
      unique: true,
      name: 'tax_exemptions_number_unique_idx'
    });
    await queryInterface.addIndex('tax_exemptions', ['entity_type', 'entity_id']);
    await queryInterface.addIndex('tax_exemptions', ['is_active']);
    await queryInterface.addIndex('tax_exemptions', ['effective_from', 'effective_to']);
    await queryInterface.addIndex('tax_exemptions', ['country', 'state']);

    // ============================================
    // CREDIT NOTES
    // ============================================

    await queryInterface.createTable('credit_notes', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      credit_note_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      invoice_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'invoices',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
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
      issue_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('draft', 'issued', 'applied', 'void'),
        allowNull: false,
        defaultValue: 'draft'
      },
      reason: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      credit_type: {
        type: Sequelize.ENUM('full_refund', 'partial_refund', 'price_adjustment', 'return', 'error_correction', 'discount', 'other'),
        allowNull: false
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
      total: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      applied_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      remaining_balance: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      line_items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: []
      },
      refund_method: {
        type: Sequelize.ENUM('original_payment', 'bank_transfer', 'check', 'cash', 'store_credit', 'none'),
        allowNull: true
      },
      refund_status: {
        type: Sequelize.ENUM('pending', 'processing', 'completed', 'failed', 'not_applicable'),
        allowNull: false,
        defaultValue: 'not_applicable'
      },
      refunded_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      refund_reference: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      applications: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      internal_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      attachments: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      created_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      approved_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      voided_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      voided_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      void_reason: {
        type: Sequelize.STRING(500),
        allowNull: true
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

    // Add indexes for credit_notes
    await queryInterface.addIndex('credit_notes', ['credit_note_number'], {
      unique: true,
      name: 'credit_notes_number_unique_idx'
    });
    await queryInterface.addIndex('credit_notes', ['customer_id']);
    await queryInterface.addIndex('credit_notes', ['invoice_id']);
    await queryInterface.addIndex('credit_notes', ['status']);
    await queryInterface.addIndex('credit_notes', ['issue_date']);
    await queryInterface.addIndex('credit_notes', ['credit_type']);

    // ============================================
    // PROJECTS TABLE
    // ============================================

    await queryInterface.createTable('projects', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      project_type: {
        type: Sequelize.ENUM('internal', 'client', 'research', 'maintenance', 'product'),
        allowNull: false,
        defaultValue: 'internal'
      },
      status: {
        type: Sequelize.ENUM('planning', 'active', 'on_hold', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'planning'
      },
      priority: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
        defaultValue: 'medium'
      },
      health: {
        type: Sequelize.ENUM('on_track', 'at_risk', 'off_track'),
        allowNull: true
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      actual_start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      actual_end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      budget: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      actual_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      estimated_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      billing_type: {
        type: Sequelize.ENUM('fixed_price', 'time_and_materials', 'retainer', 'non_billable'),
        allowNull: true,
        defaultValue: 'non_billable'
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'customers',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      company_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      opportunity_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      project_manager_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      team_members: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      department_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'departments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      estimated_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      actual_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      completion_percentage: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_tasks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      completed_tasks: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      milestones: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
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

    // Add indexes for projects
    await queryInterface.addIndex('projects', ['project_number'], {
      unique: true,
      name: 'projects_number_unique_idx'
    });
    await queryInterface.addIndex('projects', ['status']);
    await queryInterface.addIndex('projects', ['project_manager_id']);
    await queryInterface.addIndex('projects', ['customer_id']);
    await queryInterface.addIndex('projects', ['start_date', 'end_date']);

    // ============================================
    // ENHANCEMENTS TO EXISTING TABLES
    // ============================================

    // Add reconciliation fields to payments (if not already present)
    try {
      await queryInterface.addColumn('payments', 'reconciled', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    } catch (error) {
      // Column may already exist
      console.log('Payment.reconciled column may already exist');
    }

    try {
      await queryInterface.addColumn('payments', 'reconciled_date', {
        type: Sequelize.DATE,
        allowNull: true
      });
    } catch (error) {
      console.log('Payment.reconciled_date column may already exist');
    }

    try {
      await queryInterface.addColumn('payments', 'reconciled_by_id', {
        type: Sequelize.UUID,
        allowNull: true
      });
    } catch (error) {
      console.log('Payment.reconciled_by_id column may already exist');
    }

    // Add reconciliation fields to journal_entries (if not already present)
    try {
      await queryInterface.addColumn('journal_entries', 'reconciled', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      });
    } catch (error) {
      console.log('JournalEntry.reconciled column may already exist');
    }

    try {
      await queryInterface.addColumn('journal_entries', 'reconciled_date', {
        type: Sequelize.DATE,
        allowNull: true
      });
    } catch (error) {
      console.log('JournalEntry.reconciled_date column may already exist');
    }

    try {
      await queryInterface.addColumn('journal_entries', 'reconciled_by_id', {
        type: Sequelize.UUID,
        allowNull: true
      });
    } catch (error) {
      console.log('JournalEntry.reconciled_by_id column may already exist');
    }

    // Add bank statement tracking to accounts (if not already present)
    try {
      await queryInterface.addColumn('accounts', 'bank_statements', {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      });
    } catch (error) {
      console.log('Account.bank_statements column may already exist');
    }

    try {
      await queryInterface.addColumn('accounts', 'last_reconciliation_date', {
        type: Sequelize.DATE,
        allowNull: true
      });
    } catch (error) {
      console.log('Account.last_reconciliation_date column may already exist');
    }

    try {
      await queryInterface.addColumn('accounts', 'reconciled_balance', {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      });
    } catch (error) {
      console.log('Account.reconciled_balance column may already exist');
    }

    console.log('✅ ERP Tax Management, Credit Notes, and Enhanced Features migration completed');
  },

  down: async (queryInterface, Sequelize) => {
    // Drop indexes first
    await queryInterface.removeIndex('tax_rates', 'tax_rates_code_unique_idx');
    await queryInterface.removeIndex('tax_exemptions', 'tax_exemptions_number_unique_idx');
    await queryInterface.removeIndex('credit_notes', 'credit_notes_number_unique_idx');
    await queryInterface.removeIndex('projects', 'projects_number_unique_idx');

    // Drop tables
    await queryInterface.dropTable('credit_notes');
    await queryInterface.dropTable('tax_exemptions');
    await queryInterface.dropTable('tax_rates');
    await queryInterface.dropTable('projects');

    // Remove added columns
    try {
      await queryInterface.removeColumn('payments', 'reconciled');
      await queryInterface.removeColumn('payments', 'reconciled_date');
      await queryInterface.removeColumn('payments', 'reconciled_by_id');
    } catch (error) {
      console.log('Could not remove payment reconciliation columns');
    }

    try {
      await queryInterface.removeColumn('journal_entries', 'reconciled');
      await queryInterface.removeColumn('journal_entries', 'reconciled_date');
      await queryInterface.removeColumn('journal_entries', 'reconciled_by_id');
    } catch (error) {
      console.log('Could not remove journal entry reconciliation columns');
    }

    try {
      await queryInterface.removeColumn('accounts', 'bank_statements');
      await queryInterface.removeColumn('accounts', 'last_reconciliation_date');
      await queryInterface.removeColumn('accounts', 'reconciled_balance');
    } catch (error) {
      console.log('Could not remove account reconciliation columns');
    }
  }
};
