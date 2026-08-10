/**
 * Migration: Groupware Enhancements - Phase 1
 * Creates tables for Kanban boards, time tracking, and Gantt chart support
 *
 * New tables:
 * - boards: Kanban board management
 * - board_columns: Columns within boards
 * - board_cards: Cards (linked to tasks) in columns
 * - time_entries: Time tracking with timer support
 */

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // Create boards table
    await queryInterface.createTable('boards', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      board_type: {
        type: Sequelize.ENUM('kanban', 'scrum', 'support', 'custom'),
        allowNull: false,
        defaultValue: 'kanban'
      },
      visibility: {
        type: Sequelize.ENUM('private', 'team', 'organization', 'public'),
        allowNull: false,
        defaultValue: 'team'
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      team_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: false,
        defaultValue: {}
      },
      status: {
        type: Sequelize.ENUM('active', 'archived', 'template'),
        allowNull: false,
        defaultValue: 'active'
      },
      archived_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      archived_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      is_template: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      template_name: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      source_template_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      background_color: {
        type: Sequelize.STRING(7),
        allowNull: true,
        defaultValue: '#ffffff'
      },
      background_image: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      card_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      member_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
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

    // Add indexes for boards
    await queryInterface.addIndex('boards', ['owner_id']);
    await queryInterface.addIndex('boards', ['project_id']);
    await queryInterface.addIndex('boards', ['team_id']);
    await queryInterface.addIndex('boards', ['status']);
    await queryInterface.addIndex('boards', ['board_type']);
    await queryInterface.addIndex('boards', ['is_template']);
    await queryInterface.addIndex('boards', ['visibility']);

    // Create board_columns table
    await queryInterface.createTable('board_columns', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      board_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'boards',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      name: {
        type: Sequelize.STRING(255),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      color: {
        type: Sequelize.STRING(7),
        allowNull: true
      },
      task_status: {
        type: Sequelize.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
        allowNull: true
      },
      wip_limit: {
        type: Sequelize.INTEGER,
        allowNull: true
      },
      is_complete_column: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_default_column: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      auto_assign_to: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_enter_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_exit_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      card_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      is_archived: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      settings: {
        type: Sequelize.JSONB,
        allowNull: false,
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

    // Add indexes for board_columns
    await queryInterface.addIndex('board_columns', ['board_id']);
    await queryInterface.addIndex('board_columns', ['task_status']);
    await queryInterface.addIndex('board_columns', ['is_archived']);
    await queryInterface.addIndex('board_columns', ['board_id', 'position'], { unique: true });

    // Create board_cards table
    await queryInterface.createTable('board_cards', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      board_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'boards',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      column_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'board_columns',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      task_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'tasks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      swimlane_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      cover_image: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      cover_color: {
        type: Sequelize.STRING(7),
        allowNull: true
      },
      labels: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      added_by_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      added_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW
      },
      moved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      previous_column_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      time_in_column: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_moves: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      is_blocked: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      block_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      is_archived: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      archived_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      votes: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      watcher_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
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

    // Add indexes for board_cards
    await queryInterface.addIndex('board_cards', ['board_id']);
    await queryInterface.addIndex('board_cards', ['column_id']);
    await queryInterface.addIndex('board_cards', ['task_id']);
    await queryInterface.addIndex('board_cards', ['swimlane_id']);
    await queryInterface.addIndex('board_cards', ['is_archived']);
    await queryInterface.addIndex('board_cards', ['added_by_id']);
    await queryInterface.addIndex('board_cards', ['column_id', 'position']);
    await queryInterface.addIndex('board_cards', ['board_id', 'task_id'], { unique: true });

    // Create time_entries table
    await queryInterface.createTable('time_entries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      task_id: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'tasks',
          key: 'id'
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      activity_type: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: true
      },
      duration: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Duration in seconds'
      },
      is_manual: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_running: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      is_billable: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      hourly_rate: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      billed_amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      invoice_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      invoiced_at: {
        type: Sequelize.DATE,
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
      tags: {
        type: Sequelize.ARRAY(Sequelize.STRING),
        allowNull: true,
        defaultValue: []
      },
      location: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('draft', 'submitted', 'approved', 'rejected', 'invoiced'),
        allowNull: false,
        defaultValue: 'draft'
      },
      submitted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      approved_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      approved_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      rejected_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      rejected_by_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      rejection_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      break_duration: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Break time in seconds'
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

    // Add indexes for time_entries
    await queryInterface.addIndex('time_entries', ['user_id']);
    await queryInterface.addIndex('time_entries', ['task_id']);
    await queryInterface.addIndex('time_entries', ['project_id']);
    await queryInterface.addIndex('time_entries', ['start_time']);
    await queryInterface.addIndex('time_entries', ['end_time']);
    await queryInterface.addIndex('time_entries', ['is_running']);
    await queryInterface.addIndex('time_entries', ['is_billable']);
    await queryInterface.addIndex('time_entries', ['status']);
    await queryInterface.addIndex('time_entries', ['invoice_id']);
    await queryInterface.addIndex('time_entries', ['activity_type']);
    await queryInterface.addIndex('time_entries', ['user_id', 'start_time']);
    await queryInterface.addIndex('time_entries', ['user_id', 'is_running']);

    console.log('✅ Groupware enhancements migration completed');
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order (respecting foreign keys)
    await queryInterface.dropTable('time_entries');
    await queryInterface.dropTable('board_cards');
    await queryInterface.dropTable('board_columns');
    await queryInterface.dropTable('boards');

    console.log('✅ Groupware enhancements migration rolled back');
  }
};
