/**
 * Migration: Create Groupware Tables
 *
 * Creates tables for the Groupware module:
 * - calendars: User and organizational calendars
 * - calendar_events: Calendar events with recurrence support
 * - tasks: Task management with subtasks
 * - task_assignments: Task-to-user/team assignments
 * - task_dependencies: Task dependency tracking
 * - folders: Hierarchical folder structure
 * - documents: Document storage and versioning
 * - notes: Personal and shared notes
 * - wiki_pages: Wiki pages with categories
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {
    // ============================================
    // Calendar Tables
    // ============================================

    // Create calendars table
    await queryInterface.createTable('calendars', {
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
      color: {
        type: Sequelize.STRING(7),
        allowNull: true,
        defaultValue: '#3788d8'
      },
      timezone: {
        type: Sequelize.STRING(100),
        allowNull: true,
        defaultValue: 'UTC'
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      organization_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // Add indexes for calendars
    await queryInterface.addIndex('calendars', ['owner_id']);
    await queryInterface.addIndex('calendars', ['organization_id']);
    await queryInterface.addIndex('calendars', ['is_public']);

    // Create calendar_events table
    await queryInterface.createTable('calendar_events', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      calendar_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      location: {
        type: Sequelize.STRING(500),
        allowNull: true
      },
      event_type: {
        type: Sequelize.ENUM('meeting', 'appointment', 'task', 'reminder', 'out_of_office', 'holiday', 'other'),
        allowNull: false,
        defaultValue: 'meeting'
      },
      // Timing
      start_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: false
      },
      all_day: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      timezone: {
        type: Sequelize.STRING(100),
        allowNull: true,
        defaultValue: 'UTC'
      },
      // Recurrence
      is_recurring: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      recurrence_rule: {
        type: Sequelize.STRING(500),
        allowNull: true,
        comment: 'iCal RRULE format'
      },
      recurrence_exceptions: {
        type: Sequelize.ARRAY(Sequelize.DATE),
        allowNull: true,
        comment: 'Dates to exclude from recurrence'
      },
      recurring_event_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'ID of parent recurring event'
      },
      // Attendees
      organizer_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      attendees: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of { userId, email, status, isOptional }'
      },
      resources: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of { resourceId, name, type }'
      },
      reminders: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: [],
        comment: 'Array of { method, minutesBefore }'
      },
      // Status
      status: {
        type: Sequelize.ENUM('tentative', 'confirmed', 'cancelled'),
        allowNull: false,
        defaultValue: 'confirmed'
      },
      visibility: {
        type: Sequelize.ENUM('public', 'private', 'confidential'),
        allowNull: false,
        defaultValue: 'public'
      },
      // Meeting details
      meeting_url: {
        type: Sequelize.STRING(1000),
        allowNull: true
      },
      dial_in_number: {
        type: Sequelize.STRING(100),
        allowNull: true
      },
      conference_id: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      // Workflow integration
      on_create_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_update_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_cancel_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      // iCal integration
      ical_uid: {
        type: Sequelize.STRING(255),
        allowNull: true,
        comment: 'Unique identifier for iCal format'
      },
      sequence: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'iCal sequence number for updates'
      },
      attachments: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: []
      },
      color: {
        type: Sequelize.STRING(7),
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // Add indexes for calendar_events
    await queryInterface.addIndex('calendar_events', ['calendar_id']);
    await queryInterface.addIndex('calendar_events', ['organizer_id']);
    await queryInterface.addIndex('calendar_events', ['start_time', 'end_time']);
    await queryInterface.addIndex('calendar_events', ['status']);
    await queryInterface.addIndex('calendar_events', ['event_type']);
    await queryInterface.addIndex('calendar_events', ['recurring_event_id']);
    await queryInterface.addIndex('calendar_events', ['ical_uid']);

    // ============================================
    // Task Tables
    // ============================================

    // Create tasks table
    await queryInterface.createTable('tasks', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      title: {
        type: Sequelize.STRING(500),
        allowNull: false
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      status: {
        type: Sequelize.ENUM('pending', 'in_progress', 'completed', 'cancelled'),
        allowNull: false,
        defaultValue: 'pending'
      },
      priority: {
        type: Sequelize.ENUM('low', 'medium', 'high', 'urgent'),
        allowNull: false,
        defaultValue: 'medium'
      },
      due_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      assignee_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      creator_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      project_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      parent_task_id: {
        type: Sequelize.UUID,
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
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for tasks
    await queryInterface.addIndex('tasks', ['assignee_id']);
    await queryInterface.addIndex('tasks', ['creator_id']);
    await queryInterface.addIndex('tasks', ['status']);
    await queryInterface.addIndex('tasks', ['due_date']);
    await queryInterface.addIndex('tasks', ['project_id']);
    await queryInterface.addIndex('tasks', ['parent_task_id']);

    // Create task_assignments table
    await queryInterface.createTable('task_assignments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      task_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      assigned_to_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'User or team ID'
      },
      assignee_type: {
        type: Sequelize.ENUM('user', 'team', 'role'),
        allowNull: false,
        defaultValue: 'user'
      },
      assigned_by_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      // Assignment details
      role: {
        type: Sequelize.ENUM('owner', 'contributor', 'reviewer', 'observer'),
        allowNull: false,
        defaultValue: 'contributor'
      },
      is_primary: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Primary assignee responsible for the task'
      },
      // Status
      status: {
        type: Sequelize.ENUM('pending', 'accepted', 'declined', 'reassigned', 'completed'),
        allowNull: false,
        defaultValue: 'pending'
      },
      accepted_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      declined_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      completed_at: {
        type: Sequelize.DATE,
        allowNull: true
      },
      decline_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      // Time tracking
      estimated_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true
      },
      actual_hours: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0
      },
      // Workload allocation
      allocation_percentage: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Percentage of work assigned to this person'
      },
      // Routing information
      routed_from_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Previous assignee if task was routed'
      },
      routing_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      auto_routed: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Was this assignment made by auto-routing?'
      },
      routing_rule_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'ID of the routing rule that assigned this task'
      },
      // Notifications
      notification_sent: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      reminder_sent: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      // Workflow integration
      on_assign_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      on_accept_workflow_id: {
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
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // Add indexes for task_assignments
    await queryInterface.addIndex('task_assignments', ['task_id']);
    await queryInterface.addIndex('task_assignments', ['assigned_to_id']);
    await queryInterface.addIndex('task_assignments', ['assigned_by_id']);
    await queryInterface.addIndex('task_assignments', ['status']);
    await queryInterface.addIndex('task_assignments', ['is_primary']);
    await queryInterface.addIndex('task_assignments', ['role']);
    await queryInterface.addIndex('task_assignments', ['routing_rule_id']);

    // Create task_dependencies table
    await queryInterface.createTable('task_dependencies', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true
      },
      task_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'The dependent task'
      },
      depends_on_task_id: {
        type: Sequelize.UUID,
        allowNull: false,
        comment: 'The task that must be completed first'
      },
      dependency_type: {
        type: Sequelize.ENUM('finish_to_start', 'start_to_start', 'finish_to_finish', 'start_to_finish'),
        allowNull: false,
        defaultValue: 'finish_to_start',
        comment: 'FS: predecessor finishes before successor starts'
      },
      lag_days: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
        comment: 'Delay between tasks (can be negative for lead time)'
      },
      // Status tracking
      is_blocking: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
        comment: 'If true, dependent task cannot start until dependency is met'
      },
      is_critical_path: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'Part of the critical path'
      },
      status: {
        type: Sequelize.ENUM('active', 'met', 'violated', 'cancelled'),
        allowNull: false,
        defaultValue: 'active'
      },
      met_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the dependency was satisfied'
      },
      violated_at: {
        type: Sequelize.DATE,
        allowNull: true,
        comment: 'When the dependency was violated'
      },
      // Workflow integration
      on_met_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Workflow to trigger when dependency is met'
      },
      on_violated_workflow_id: {
        type: Sequelize.UUID,
        allowNull: true,
        comment: 'Workflow to trigger when dependency is violated'
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // Add indexes for task_dependencies
    await queryInterface.addIndex('task_dependencies', ['task_id']);
    await queryInterface.addIndex('task_dependencies', ['depends_on_task_id']);
    await queryInterface.addIndex('task_dependencies', ['status']);
    await queryInterface.addIndex('task_dependencies', ['is_critical_path']);
    await queryInterface.addIndex('task_dependencies', ['task_id', 'depends_on_task_id'], {
      unique: true,
      name: 'task_dependencies_unique'
    });

    // ============================================
    // Document and Folder Tables
    // ============================================

    // Create folders table
    await queryInterface.createTable('folders', {
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
      folder_type: {
        type: Sequelize.ENUM('document', 'note', 'general'),
        allowNull: false,
        defaultValue: 'general'
      },
      // Hierarchy
      parent_folder_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      path: {
        type: Sequelize.STRING(2000),
        allowNull: true,
        comment: 'Full path like /parent/child'
      },
      depth: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      position: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      // Ownership and permissions
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      permissions: {
        type: Sequelize.JSONB,
        allowNull: true,
        comment: 'Folder-specific permissions'
      },
      // Sharing
      shared_with: {
        type: Sequelize.ARRAY(Sequelize.UUID),
        allowNull: true,
        comment: 'Array of user IDs'
      },
      // System folders
      is_system: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        comment: 'System folders cannot be deleted'
      },
      system_type: {
        type: Sequelize.ENUM('inbox', 'drafts', 'trash', 'archive', 'templates'),
        allowNull: true
      },
      // Metadata
      item_count: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_size: {
        type: Sequelize.BIGINT,
        allowNull: false,
        defaultValue: 0,
        comment: 'Total size in bytes'
      },
      color: {
        type: Sequelize.STRING(7),
        allowNull: true
      },
      icon: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      metadata: {
        type: Sequelize.JSONB,
        allowNull: true,
        defaultValue: {}
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

    // Add indexes for folders
    await queryInterface.addIndex('folders', ['owner_id']);
    await queryInterface.addIndex('folders', ['parent_folder_id']);
    await queryInterface.addIndex('folders', ['folder_type']);
    await queryInterface.addIndex('folders', ['is_public']);
    await queryInterface.addIndex('folders', ['system_type']);
    await queryInterface.addIndex('folders', ['path']);

    // Create documents table
    await queryInterface.createTable('documents', {
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
      file_type: {
        type: Sequelize.STRING(100),
        allowNull: false
      },
      file_size: {
        type: Sequelize.BIGINT,
        allowNull: false
      },
      file_path: {
        type: Sequelize.STRING(1000),
        allowNull: false
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      owner_id: {
        type: Sequelize.UUID,
        allowNull: false
      },
      folder_id: {
        type: Sequelize.UUID,
        allowNull: true
      },
      is_public: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false
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
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes for documents
    await queryInterface.addIndex('documents', ['owner_id']);
    await queryInterface.addIndex('documents', ['folder_id']);
    await queryInterface.addIndex('documents', ['file_type']);
    await queryInterface.addIndex('documents', ['is_public']);
  },

  down: async (queryInterface, Sequelize) => {
    // Drop tables in reverse order (respecting dependencies)
    await queryInterface.dropTable('documents');
    await queryInterface.dropTable('folders');
    await queryInterface.dropTable('task_dependencies');
    await queryInterface.dropTable('task_assignments');
    await queryInterface.dropTable('tasks');
    await queryInterface.dropTable('calendar_events');
    await queryInterface.dropTable('calendars');
  }
};
