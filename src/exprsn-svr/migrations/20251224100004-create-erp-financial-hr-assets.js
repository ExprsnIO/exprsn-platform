'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ===== Financial Tables =====

    // Accounts (Chart of Accounts)
    await queryInterface.createTable('accounts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      account_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      account_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      account_type: {
        type: Sequelize.ENUM(
          'asset', 'liability', 'equity', 'revenue', 'expense',
          'accounts_receivable', 'accounts_payable', 'cash', 'bank',
          'fixed_asset', 'other_current_asset', 'other_asset',
          'credit_card', 'long_term_liability', 'other_current_liability',
          'cost_of_goods_sold'
        ),
        allowNull: false
      },
      normal_balance: {
        type: Sequelize.ENUM('debit', 'credit'),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      parent_account_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'accounts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      is_system_account: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      current_balance: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      bank_account_number: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      bank_routing_number: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      bank_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      tax_account: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      tax_rate: {
        type: Sequelize.DECIMAL(5, 2),
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

    await queryInterface.addIndex('accounts', ['account_number'], { unique: true });
    await queryInterface.addIndex('accounts', ['account_type']);
    await queryInterface.addIndex('accounts', ['parent_account_id']);
    await queryInterface.addIndex('accounts', ['is_active']);

    // Journal Entries
    await queryInterface.createTable('journal_entries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      entry_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      entry_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      entry_type: {
        type: Sequelize.ENUM(
          'standard', 'adjusting', 'closing', 'reversing',
          'recurring', 'opening_balance', 'year_end', 'other'
        ),
        allowNull: false,
        defaultValue: 'standard'
      },
      reference: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      line_items: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: []
      },
      total_debit: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_credit: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      is_posted: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      posted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      posted_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('draft', 'pending_approval', 'approved', 'posted', 'reversed'),
        allowNull: false,
        defaultValue: 'draft'
      },
      approved_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      reversal_of_entry_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'journal_entries',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      reversed_by_entry_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'journal_entries',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      is_recurring: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      recurring_frequency: {
        type: Sequelize.ENUM('monthly', 'quarterly', 'annually'),
        allowNull: true
      },
      next_occurrence_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      attachments: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
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

    await queryInterface.addIndex('journal_entries', ['entry_number'], { unique: true });
    await queryInterface.addIndex('journal_entries', ['entry_date']);
    await queryInterface.addIndex('journal_entries', ['entry_type']);
    await queryInterface.addIndex('journal_entries', ['status']);
    await queryInterface.addIndex('journal_entries', ['is_posted']);

    // Payments
    await queryInterface.createTable('payments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      payment_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      payment_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      payment_type: {
        type: Sequelize.ENUM('customer_payment', 'vendor_payment', 'employee_reimbursement', 'other'),
        allowNull: false
      },
      payment_method: {
        type: Sequelize.ENUM(
          'cash', 'check', 'credit_card', 'debit_card', 'bank_transfer',
          'ach', 'wire', 'paypal', 'stripe', 'other'
        ),
        allowNull: false
      },
      customer_id: {
        type: Sequelize.UUID,
        allowNull: true
        // FK constraint will be added after customers table is created
      },
      supplier_id: {
        type: Sequelize.UUID,
        allowNull: true
        // FK constraint will be added after suppliers table is created
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: true
        // FK constraint will be added after employees table is created
      },
      amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      exchange_rate: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: true,
        defaultValue: 1
      },
      deposit_to_account_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'accounts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      reference_number: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      check_number: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      applied_to: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: []
      },
      unapplied_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      status: {
        type: Sequelize.ENUM('draft', 'pending', 'cleared', 'bounced', 'voided'),
        allowNull: false,
        defaultValue: 'pending'
      },
      cleared_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      journal_entry_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'journal_entries',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      gateway_name: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      gateway_transaction_id: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      gateway_response: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      card_last_four: {
        type: Sequelize.STRING(4),
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      attachments: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('payments', ['payment_number'], { unique: true });
    await queryInterface.addIndex('payments', ['payment_date']);
    await queryInterface.addIndex('payments', ['payment_type']);
    await queryInterface.addIndex('payments', ['customer_id']);
    await queryInterface.addIndex('payments', ['supplier_id']);
    await queryInterface.addIndex('payments', ['status']);

    // ===== HR Tables =====

    // Departments
    await queryInterface.createTable('departments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      department_code: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      department_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      parent_department_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'departments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      manager_employee_id: {
        type: Sequelize.UUID,
        allowNull: true
        // FK will be added after employees table is created
      },
      cost_center: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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

    await queryInterface.addIndex('departments', ['department_code']);
    await queryInterface.addIndex('departments', ['parent_department_id']);
    await queryInterface.addIndex('departments', ['is_active']);

    // Employees
    await queryInterface.createTable('employees', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      employee_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      first_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      last_name: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      email: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      phone: {
        type: Sequelize.STRING(50),
        allowNull: true
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
      manager_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      job_title: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      employment_type: {
        type: Sequelize.ENUM('full_time', 'part_time', 'contract', 'temporary', 'intern'),
        allowNull: false,
        defaultValue: 'full_time'
      },
      employment_status: {
        type: Sequelize.ENUM('active', 'on_leave', 'terminated', 'retired'),
        allowNull: false,
        defaultValue: 'active'
      },
      hire_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      termination_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      date_of_birth: {
        type: Sequelize.DATE,
        allowNull: true
      },
      salary: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      hourly_rate: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      address: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      city: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      state: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      postal_code: {
        type: Sequelize.STRING(20),
        allowNull: true
      },
      country: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      emergency_contact_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      emergency_contact_phone: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
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

    await queryInterface.addIndex('employees', ['employee_number']);
    await queryInterface.addIndex('employees', ['email']);
    await queryInterface.addIndex('employees', ['department_id']);
    await queryInterface.addIndex('employees', ['manager_id']);
    await queryInterface.addIndex('employees', ['employment_status']);
    await queryInterface.addIndex('employees', ['is_active']);

    // Payroll
    await queryInterface.createTable('payrolls', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      payroll_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      pay_period_start: {
        type: Sequelize.DATE,
        allowNull: false
      },
      pay_period_end: {
        type: Sequelize.DATE,
        allowNull: false
      },
      pay_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      pay_frequency: {
        type: Sequelize.ENUM('weekly', 'bi_weekly', 'semi_monthly', 'monthly'),
        allowNull: false
      },
      hours_worked: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      overtime_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      regular_pay: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      overtime_pay: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      bonus: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      commission: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      other_earnings: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      gross_pay: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      federal_tax: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      state_tax: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      local_tax: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      social_security_tax: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      medicare_tax: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      health_insurance: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      retirement_contribution: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      other_deductions: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      total_deductions: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      net_pay: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      employer_social_security: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      employer_medicare: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      employer_unemployment: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      employer_retirement_match: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      ytd_gross_pay: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      ytd_federal_tax: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      ytd_state_tax: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      ytd_social_security: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      ytd_medicare: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      ytd_net_pay: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      payment_method: {
        type: Sequelize.ENUM('direct_deposit', 'check', 'cash', 'payroll_card'),
        allowNull: false,
        defaultValue: 'direct_deposit'
      },
      bank_account_last_four: {
        type: Sequelize.STRING(4),
        allowNull: true
      },
      check_number: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      time_entry_ids: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      status: {
        type: Sequelize.ENUM('draft', 'pending_approval', 'approved', 'processed', 'paid', 'voided'),
        allowNull: false,
        defaultValue: 'draft'
      },
      approved_by_user_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      processed_at: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('payrolls', ['payroll_number'], { unique: true });
    await queryInterface.addIndex('payrolls', ['employee_id']);
    await queryInterface.addIndex('payrolls', ['pay_period_start', 'pay_period_end']);
    await queryInterface.addIndex('payrolls', ['pay_date']);
    await queryInterface.addIndex('payrolls', ['status']);

    // Leave Requests
    await queryInterface.createTable('leave_requests', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      request_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      leave_type: {
        type: Sequelize.ENUM(
          'pto', 'sick', 'vacation', 'personal', 'bereavement',
          'jury_duty', 'military', 'maternity', 'paternity',
          'parental', 'sabbatical', 'unpaid', 'other'
        ),
        allowNull: false
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      total_days: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false
      },
      is_half_day: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      half_day_period: {
        type: Sequelize.ENUM('morning', 'afternoon'),
        allowNull: true
      },
      reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('draft', 'submitted', 'pending_approval', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'draft'
      },
      submitted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      approver_ids: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      current_approver_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      approval_history: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      rejected_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      cancelled_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      cancellation_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      balance_before_leave: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      balance_after_leave: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      delegate_employee_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      delegate_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      emergency_contact: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      attachments: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('leave_requests', ['request_number'], { unique: true });
    await queryInterface.addIndex('leave_requests', ['employee_id']);
    await queryInterface.addIndex('leave_requests', ['leave_type']);
    await queryInterface.addIndex('leave_requests', ['status']);
    await queryInterface.addIndex('leave_requests', ['start_date', 'end_date']);

    // Performance Reviews
    await queryInterface.createTable('performance_reviews', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      review_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      employee_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      reviewer_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      review_period_start: {
        type: Sequelize.DATE,
        allowNull: false
      },
      review_period_end: {
        type: Sequelize.DATE,
        allowNull: false
      },
      review_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      review_type: {
        type: Sequelize.ENUM(
          'annual', 'mid_year', 'quarterly', 'probation', '90_day',
          'project', 'promotion', 'pip', 'other'
        ),
        allowNull: false
      },
      overall_rating: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      overall_rating_label: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      competencies: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      previous_goals: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      new_goals: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      strengths: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      areas_for_improvement: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      development_plan: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      manager_comments: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      self_assessment: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      self_rating: {
        type: Sequelize.DECIMAL(3, 2),
        allowNull: true
      },
      employee_comments: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      employee_acknowledged: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      acknowledged_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      current_salary: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      recommended_salary: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      salary_increase: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      salary_increase_percent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true
      },
      bonus_recommended: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      effective_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      current_job_title: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      recommended_job_title: {
        type: Sequelize.STRING(200),
        allowNull: true
      },
      promotion_recommended: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_pip: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      pip_duration: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      pip_milestones: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM(
          'draft', 'self_assessment_pending', 'review_in_progress',
          'pending_employee_acknowledgment', 'pending_hr_approval',
          'completed', 'cancelled'
        ),
        allowNull: false,
        defaultValue: 'draft'
      },
      due_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      hr_approved_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      hr_approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      hr_comments: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      peer_reviewers: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        defaultValue: []
      },
      peer_reviews: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      on_complete_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      attachments: {
        type: Sequelize.JSONB,
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

    await queryInterface.addIndex('performance_reviews', ['review_number'], { unique: true });
    await queryInterface.addIndex('performance_reviews', ['employee_id']);
    await queryInterface.addIndex('performance_reviews', ['reviewer_id']);
    await queryInterface.addIndex('performance_reviews', ['status']);
    await queryInterface.addIndex('performance_reviews', ['review_type']);
    await queryInterface.addIndex('performance_reviews', ['review_period_start', 'review_period_end']);
    await queryInterface.addIndex('performance_reviews', ['due_date']);

    // ===== Asset Management Tables =====

    // Assets
    await queryInterface.createTable('assets', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      asset_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      asset_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      asset_type: {
        type: Sequelize.ENUM(
          'equipment', 'vehicle', 'furniture', 'computer', 'software',
          'building', 'land', 'leasehold_improvement', 'other'
        ),
        allowNull: false
      },
      category: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      serial_number: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      model: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      manufacturer: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      purchase_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      purchase_price: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      current_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      salvage_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      depreciation_method: {
        type: Sequelize.ENUM(
          'straight_line', 'declining_balance', 'sum_of_years_digits',
          'units_of_production', 'none'
        ),
        allowNull: false,
        defaultValue: 'straight_line'
      },
      useful_life_years: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      useful_life_units: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      accumulated_depreciation: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0
      },
      last_depreciation_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      asset_account_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'accounts',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      depreciation_account_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      expense_account_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      location: {
        type: Sequelize.STRING(255),
        allowNull: true
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
      assigned_to_employee_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      assigned_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM(
          'active', 'in_use', 'in_storage', 'under_maintenance',
          'retired', 'sold', 'disposed', 'lost', 'stolen'
        ),
        allowNull: false,
        defaultValue: 'active'
      },
      condition: {
        type: Sequelize.ENUM('excellent', 'good', 'fair', 'poor', 'broken'),
        allowNull: true
      },
      disposal_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      disposal_method: {
        type: Sequelize.ENUM('sold', 'donated', 'scrapped', 'returned', 'traded', 'other'),
        allowNull: true
      },
      disposal_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      disposal_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      warranty_start_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      warranty_end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      warranty_provider: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      warranty_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      insured: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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
      supplier_id: {
        type: Sequelize.UUID,
        allowNull: true
        // FK constraint will be added after suppliers table is created
      },
      purchase_order_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      invoice_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      last_maintenance_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      next_maintenance_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      maintenance_schedule_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      images: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      documents: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      specifications: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      custom_fields: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
      },
      barcode: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      rfid_tag: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      qr_code: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
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

    await queryInterface.addIndex('assets', ['asset_number'], { unique: true });
    await queryInterface.addIndex('assets', ['asset_type']);
    await queryInterface.addIndex('assets', ['status']);
    await queryInterface.addIndex('assets', ['serial_number']);
    await queryInterface.addIndex('assets', ['department_id']);
    await queryInterface.addIndex('assets', ['assigned_to_employee_id']);
    await queryInterface.addIndex('assets', ['supplier_id']);
    await queryInterface.addIndex('assets', ['barcode']);
    await queryInterface.addIndex('assets', ['purchase_date']);

    // Maintenance Schedules
    await queryInterface.createTable('maintenance_schedules', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      schedule_number: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true
      },
      asset_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'assets',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      maintenance_type: {
        type: Sequelize.ENUM(
          'preventive', 'inspection', 'repair', 'calibration',
          'replacement', 'cleaning', 'upgrade', 'other'
        ),
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_recurring: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      frequency: {
        type: Sequelize.ENUM(
          'daily', 'weekly', 'monthly', 'quarterly',
          'semi_annually', 'annually', 'one_time'
        ),
        allowNull: false,
        defaultValue: 'one_time'
      },
      frequency_interval: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      start_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      next_due_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      last_completed_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      assigned_to_employee_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      assigned_to_department_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'departments',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      assigned_to_vendor: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      estimated_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true
      },
      estimated_duration: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      priority: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'critical'),
        allowNull: false,
        defaultValue: 'medium'
      },
      status: {
        type: Sequelize.ENUM('active', 'completed', 'cancelled', 'suspended'),
        allowNull: false,
        defaultValue: 'active'
      },
      checklist: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      procedures: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      safety_notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      required_parts: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      required_tools: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      requires_downtime: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      estimated_downtime: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      reminder_days_before: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      notifications_sent: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      completion_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      completion_history: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      on_due_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_complete_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      attachments: {
        type: Sequelize.JSONB,
        allowNull: true
      },
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
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

    await queryInterface.addIndex('maintenance_schedules', ['schedule_number'], { unique: true });
    await queryInterface.addIndex('maintenance_schedules', ['asset_id']);
    await queryInterface.addIndex('maintenance_schedules', ['status']);
    await queryInterface.addIndex('maintenance_schedules', ['next_due_date']);
    await queryInterface.addIndex('maintenance_schedules', ['assigned_to_employee_id']);
    await queryInterface.addIndex('maintenance_schedules', ['priority']);
    await queryInterface.addIndex('maintenance_schedules', ['maintenance_type']);
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order (respecting foreign key constraints)
    await queryInterface.dropTable('maintenance_schedules');
    await queryInterface.dropTable('assets');
    await queryInterface.dropTable('performance_reviews');
    await queryInterface.dropTable('leave_requests');
    await queryInterface.dropTable('payrolls');
    await queryInterface.dropTable('employees');
    await queryInterface.dropTable('departments');
    await queryInterface.dropTable('payments');
    await queryInterface.dropTable('journal_entries');
    await queryInterface.dropTable('accounts');
  }
};
