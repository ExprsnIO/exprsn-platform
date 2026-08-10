/**
 * Migration: Budget Tracking & Earned Value Management
 *
 * Adds critical financial tracking features:
 * - Granular budget items per project/task/category
 * - Budget alerts and thresholds
 * - Earned Value Management (EVM) metrics
 * - Burn rate and runway calculations
 * - Cost variance and schedule variance tracking
 *
 * Date: 2025-12-22
 * Author: Product Manager Agent
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // ============================================
    // BUDGET ITEMS
    // ============================================

    await queryInterface.createTable('budget_items', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      task_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'tasks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
        comment: 'If NULL, this is a project-level budget item'
      },
      milestone_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'project_milestones',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      category: {
        type: Sequelize.ENUM(
          'labor',
          'materials',
          'software',
          'hardware',
          'consulting',
          'travel',
          'training',
          'licenses',
          'infrastructure',
          'marketing',
          'contingency',
          'other'
        ),
        allowNull: false,
        defaultValue: 'labor'
      },
      subcategory: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'e.g., "Cloud Hosting", "Development Tools", "Office Supplies"'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: false
      },
      budgeted_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'Original budgeted amount'
      },
      revised_budget: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        comment: 'Updated budget after change requests'
      },
      actual_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Actual costs incurred (from invoices, time entries, etc.)'
      },
      committed_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Committed costs (POs issued but not yet paid)'
      },
      variance: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Calculated: budgeted_amount - actual_amount (positive = under budget)'
      },
      variance_percentage: {
        type: Sequelize.DECIMAL(6, 2),
        allowNull: false,
        defaultValue: 0,
        comment: 'Calculated: (variance / budgeted_amount) * 100'
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'USD'
      },
      fiscal_year: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      fiscal_quarter: {
        type: Sequelize.STRING(10),
        allowNull: true,
        comment: 'e.g., "2026-Q1"'
      },
      status: {
        type: Sequelize.ENUM('planned', 'approved', 'active', 'completed', 'on_hold', 'cancelled'),
        allowNull: false,
        defaultValue: 'planned'
      },
      is_capital_expense: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'CapEx vs OpEx classification'
      },
      cost_center: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      gl_account: {
        type: Sequelize.STRING(50),
        allowNull: true,
        comment: 'General Ledger account code'
      },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
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

    await queryInterface.addIndex('budget_items', ['project_id']);
    await queryInterface.addIndex('budget_items', ['task_id']);
    await queryInterface.addIndex('budget_items', ['category']);
    await queryInterface.addIndex('budget_items', ['status']);
    await queryInterface.addIndex('budget_items', ['fiscal_year', 'fiscal_quarter']);
    await queryInterface.addIndex('budget_items', ['cost_center']);

    // ============================================
    // BUDGET ALERTS
    // ============================================

    await queryInterface.createTable('budget_alerts', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      alert_name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      threshold_type: {
        type: Sequelize.ENUM('percentage', 'amount', 'burn_rate'),
        allowNull: false,
        defaultValue: 'percentage'
      },
      threshold_percentage: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'e.g., 80 = alert when 80% of budget consumed',
        validate: {
          min: 0,
          max: 100
        }
      },
      threshold_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        comment: 'Alert when spending exceeds this amount'
      },
      threshold_burn_rate: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: true,
        comment: 'Alert when daily/weekly burn rate exceeds this'
      },
      alert_type: {
        type: Sequelize.ENUM('info', 'warning', 'critical'),
        allowNull: false,
        defaultValue: 'warning'
      },
      category_filter: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'Only alert for specific category (e.g., "labor")'
      },
      recipients: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: false,
        defaultValue: [],
        comment: 'Employee IDs to notify'
      },
      notification_method: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: false,
        defaultValue: ['email'],
        comment: 'e.g., ["email", "in_app", "sms"]'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      last_triggered_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      trigger_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
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

    await queryInterface.addIndex('budget_alerts', ['project_id']);
    await queryInterface.addIndex('budget_alerts', ['is_active']);

    // ============================================
    // BUDGET CHANGE REQUESTS
    // ============================================

    await queryInterface.createTable('budget_change_requests', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      budget_item_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'budget_items',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      change_type: {
        type: Sequelize.ENUM('increase', 'decrease', 'reallocate', 'new_item'),
        allowNull: false
      },
      current_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      requested_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      change_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'Calculated: requested_amount - current_amount'
      },
      justification: {
        type: Sequelize.TEXT,
        allowNull: false,
        comment: 'Why is this budget change needed?'
      },
      impact_analysis: {
        type: Sequelize.TEXT,
        allowNull: true,
        comment: 'Impact on project timeline, scope, quality'
      },
      requested_by: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      status: {
        type: Sequelize.ENUM('pending', 'approved', 'rejected', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      },
      approved_by: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'employees',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
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

    await queryInterface.addIndex('budget_change_requests', ['budget_item_id']);
    await queryInterface.addIndex('budget_change_requests', ['project_id']);
    await queryInterface.addIndex('budget_change_requests', ['status']);

    // ============================================
    // EARNED VALUE MANAGEMENT (EVM) SNAPSHOTS
    // ============================================

    await queryInterface.createTable('earned_value_snapshots', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'projects',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      snapshot_date: {
        type: Sequelize.DATEONLY,
        allowNull: false,
        comment: 'Date of this snapshot (typically weekly or monthly)'
      },
      budget_at_completion: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'BAC - Total approved budget'
      },
      planned_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'PV (BCWS) - Budgeted Cost of Work Scheduled'
      },
      earned_value: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'EV (BCWP) - Budgeted Cost of Work Performed'
      },
      actual_cost: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'AC (ACWP) - Actual Cost of Work Performed'
      },
      schedule_variance: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'SV = EV - PV (positive = ahead of schedule)'
      },
      cost_variance: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'CV = EV - AC (positive = under budget)'
      },
      schedule_performance_index: {
        type: Sequelize.DECIMAL(5, 3),
        allowNull: false,
        comment: 'SPI = EV / PV (>1.0 = ahead of schedule)'
      },
      cost_performance_index: {
        type: Sequelize.DECIMAL(5, 3),
        allowNull: false,
        comment: 'CPI = EV / AC (>1.0 = under budget)'
      },
      estimate_at_completion: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'EAC - Forecasted final cost based on current performance'
      },
      estimate_to_complete: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'ETC = EAC - AC (cost remaining to complete)'
      },
      variance_at_completion: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        comment: 'VAC = BAC - EAC (projected over/under budget)'
      },
      to_complete_performance_index: {
        type: Sequelize.DECIMAL(5, 3),
        allowNull: true,
        comment: 'TCPI = (BAC - EV) / (BAC - AC) - CPI needed to meet budget'
      },
      percent_complete: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        comment: 'Calculated: (EV / BAC) * 100'
      },
      percent_spent: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: false,
        comment: 'Calculated: (AC / BAC) * 100'
      },
      completion_status: {
        type: Sequelize.ENUM('on_track', 'at_risk', 'off_track', 'critical'),
        allowNull: false,
        comment: 'Overall health based on SPI and CPI'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false
      }
    });

    await queryInterface.addIndex('earned_value_snapshots', ['project_id', 'snapshot_date'], {
      unique: true,
      name: 'evm_snapshots_project_date_unique'
    });
    await queryInterface.addIndex('earned_value_snapshots', ['snapshot_date']);
    await queryInterface.addIndex('earned_value_snapshots', ['completion_status']);

    // ============================================
    // VIEWS FOR REPORTING
    // ============================================

    // View: Budget summary by project
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW v_project_budget_summary AS
      SELECT
        p.id as project_id,
        p.name as project_name,
        p.status as project_status,
        SUM(bi.budgeted_amount) as total_budget,
        SUM(COALESCE(bi.revised_budget, bi.budgeted_amount)) as revised_total_budget,
        SUM(bi.actual_amount) as total_actual,
        SUM(bi.committed_amount) as total_committed,
        SUM(bi.actual_amount + bi.committed_amount) as total_encumbered,
        SUM(COALESCE(bi.revised_budget, bi.budgeted_amount)) - SUM(bi.actual_amount + bi.committed_amount) as remaining_budget,
        ROUND(
          CASE
            WHEN SUM(COALESCE(bi.revised_budget, bi.budgeted_amount)) > 0
            THEN (SUM(bi.actual_amount + bi.committed_amount) / SUM(COALESCE(bi.revised_budget, bi.budgeted_amount))) * 100
            ELSE 0
          END, 2
        ) as budget_consumed_percentage,
        CASE
          WHEN SUM(bi.actual_amount + bi.committed_amount) > SUM(COALESCE(bi.revised_budget, bi.budgeted_amount)) THEN true
          ELSE false
        END as is_over_budget
      FROM projects p
      LEFT JOIN budget_items bi ON p.id = bi.project_id
      GROUP BY p.id, p.name, p.status;
    `);

    // View: Budget by category
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW v_budget_by_category AS
      SELECT
        p.id as project_id,
        p.name as project_name,
        bi.category,
        COUNT(bi.id) as item_count,
        SUM(bi.budgeted_amount) as budgeted,
        SUM(bi.actual_amount) as actual,
        SUM(bi.variance) as variance,
        ROUND(AVG(bi.variance_percentage), 2) as avg_variance_percentage
      FROM projects p
      JOIN budget_items bi ON p.id = bi.project_id
      GROUP BY p.id, p.name, bi.category
      ORDER BY p.name, bi.category;
    `);

    // View: Latest EVM metrics
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW v_latest_evm_metrics AS
      SELECT DISTINCT ON (evm.project_id)
        evm.project_id,
        p.name as project_name,
        evm.snapshot_date,
        evm.budget_at_completion as bac,
        evm.planned_value as pv,
        evm.earned_value as ev,
        evm.actual_cost as ac,
        evm.schedule_variance as sv,
        evm.cost_variance as cv,
        evm.schedule_performance_index as spi,
        evm.cost_performance_index as cpi,
        evm.estimate_at_completion as eac,
        evm.estimate_to_complete as etc,
        evm.variance_at_completion as vac,
        evm.percent_complete,
        evm.percent_spent,
        evm.completion_status,
        CASE
          WHEN evm.schedule_performance_index >= 1.0 AND evm.cost_performance_index >= 1.0 THEN 'on_track'
          WHEN evm.schedule_performance_index < 0.9 OR evm.cost_performance_index < 0.9 THEN 'critical'
          ELSE 'at_risk'
        END as project_health
      FROM earned_value_snapshots evm
      JOIN projects p ON evm.project_id = p.id
      ORDER BY evm.project_id, evm.snapshot_date DESC;
    `);

    // View: Burn rate analysis
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW v_project_burn_rate AS
      SELECT
        p.id as project_id,
        p.name as project_name,
        p.start_date,
        p.end_date,
        EXTRACT(DAY FROM NOW() - p.start_date) as days_elapsed,
        EXTRACT(DAY FROM p.end_date - p.start_date) as total_project_days,
        SUM(bi.actual_amount) as total_spent,
        SUM(COALESCE(bi.revised_budget, bi.budgeted_amount)) as total_budget,
        CASE
          WHEN EXTRACT(DAY FROM NOW() - p.start_date) > 0
          THEN ROUND(SUM(bi.actual_amount) / EXTRACT(DAY FROM NOW() - p.start_date), 2)
          ELSE 0
        END as daily_burn_rate,
        CASE
          WHEN ROUND(SUM(bi.actual_amount) / NULLIF(EXTRACT(DAY FROM NOW() - p.start_date), 0), 2) > 0
          THEN ROUND((SUM(COALESCE(bi.revised_budget, bi.budgeted_amount)) - SUM(bi.actual_amount)) / NULLIF(ROUND(SUM(bi.actual_amount) / NULLIF(EXTRACT(DAY FROM NOW() - p.start_date), 0), 2), 0), 0)
          ELSE NULL
        END as days_of_runway_remaining
      FROM projects p
      LEFT JOIN budget_items bi ON p.id = bi.project_id
      WHERE p.status IN ('planning', 'active')
      GROUP BY p.id, p.name, p.start_date, p.end_date;
    `);

    console.log('✅ Budget Tracking & EVM module created successfully!');
    console.log('');
    console.log('Tables:');
    console.log('  - budget_items (Granular budget by task/category)');
    console.log('  - budget_alerts (Threshold-based notifications)');
    console.log('  - budget_change_requests (Budget increase/decrease workflow)');
    console.log('  - earned_value_snapshots (EVM metrics over time)');
    console.log('');
    console.log('Views:');
    console.log('  - v_project_budget_summary (Budget consumed by project)');
    console.log('  - v_budget_by_category (Spending by category)');
    console.log('  - v_latest_evm_metrics (Current EVM health)');
    console.log('  - v_project_burn_rate (Daily burn rate & runway)');
    console.log('');
    console.log('EVM Metrics Tracked:');
    console.log('  ✓ BAC (Budget at Completion)');
    console.log('  ✓ PV (Planned Value / BCWS)');
    console.log('  ✓ EV (Earned Value / BCWP)');
    console.log('  ✓ AC (Actual Cost / ACWP)');
    console.log('  ✓ SV (Schedule Variance)');
    console.log('  ✓ CV (Cost Variance)');
    console.log('  ✓ SPI (Schedule Performance Index)');
    console.log('  ✓ CPI (Cost Performance Index)');
    console.log('  ✓ EAC (Estimate at Completion)');
    console.log('  ✓ ETC (Estimate to Complete)');
    console.log('  ✓ VAC (Variance at Completion)');
    console.log('  ✓ TCPI (To Complete Performance Index)');
    console.log('');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_project_burn_rate;');
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_latest_evm_metrics;');
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_budget_by_category;');
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS v_project_budget_summary;');
    await queryInterface.dropTable('earned_value_snapshots');
    await queryInterface.dropTable('budget_change_requests');
    await queryInterface.dropTable('budget_alerts');
    await queryInterface.dropTable('budget_items');
  }
};
