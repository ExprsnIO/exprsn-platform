/**
 * Migration: Project Management Module
 *
 * Creates comprehensive project management system with:
 * - Tasks/Issues (Stories, Bugs, Ideas, Improvements)
 * - Kanban Boards with customizable columns
 * - Scrum Sprints with velocity tracking  
 * - Gantt charts with critical path analysis
 * - Waterfall phases with sign-offs
 * - Time Entries (billable/non-billable) for ERP
 * - Task dependencies and relationships
 * - Labels, comments, and attachments
 * - Board templates for different methodologies
 *
 * Date: 2025-12-22
 * Author: Product Manager Agent
 */

'use strict';

module.exports = {
  up: async (queryInterface, Sequelize) => {

    // Step 1: Create tables with no dependencies
    
    await queryInterface.createTable('task_types', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      description: { type: Sequelize.TEXT },
      icon: { type: Sequelize.STRING(50) },
      color: { type: Sequelize.STRING(7), allowNull: false, defaultValue: '#0d6efd' },
      is_system: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },
      sort_order: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('task_types', ['sort_order']);

    await queryInterface.createTable('products', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      product_code: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      name: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT },
      product_type: { type: Sequelize.ENUM('software', 'service', 'hardware', 'subscription', 'other'), defaultValue: 'software' },
      status: { type: Sequelize.ENUM('ideation', 'planning', 'development', 'beta', 'released', 'deprecated', 'sunset'), defaultValue: 'planning' },
      version: { type: Sequelize.STRING(50) },
      release_date: { type: Sequelize.DATE },
      end_of_life_date: { type: Sequelize.DATE },
      product_manager_id: { type: Sequelize.UUID, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      department_id: { type: Sequelize.UUID, references: { model: 'departments', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      roadmap: { type: Sequelize.JSONB, defaultValue: [] },
      features: { type: Sequelize.JSONB, defaultValue: [] },
      pricing: { type: Sequelize.JSONB, defaultValue: {} },
      metrics: { type: Sequelize.JSONB, defaultValue: {} },
      custom_fields: { type: Sequelize.JSONB, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('products', ['product_code'], { unique: true });
    await queryInterface.addIndex('products', ['status']);

    // Step 2: Create tables depending on projects
    
    await queryInterface.createTable('sprints', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING(100), allowNull: false },
      goal: { type: Sequelize.TEXT },
      start_date: { type: Sequelize.DATE, allowNull: false },
      end_date: { type: Sequelize.DATE, allowNull: false },
      status: { type: Sequelize.ENUM('planned', 'active', 'completed', 'cancelled'), defaultValue: 'planned' },
      capacity_hours: { type: Sequelize.DECIMAL(10, 2) },
      capacity_points: { type: Sequelize.INTEGER },
      completed_points: { type: Sequelize.INTEGER, defaultValue: 0 },
      completed_hours: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      velocity: { type: Sequelize.INTEGER },
      team_members: { type: Sequelize.ARRAY(Sequelize.UUID), defaultValue: [] },
      retrospective_notes: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('sprints', ['project_id']);
    await queryInterface.addIndex('sprints', ['status']);

    await queryInterface.createTable('boards', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT },
      board_type: { type: Sequelize.ENUM('kanban', 'scrum', 'custom'), defaultValue: 'kanban' },
      is_default: { type: Sequelize.BOOLEAN, defaultValue: false },
      visibility: { type: Sequelize.ENUM('private', 'team', 'company', 'public'), defaultValue: 'team' },
      settings: { type: Sequelize.JSONB, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('boards', ['project_id']);

    await queryInterface.createTable('board_columns', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      board_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'boards', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT },
      column_type: { type: Sequelize.ENUM('backlog', 'todo', 'in_progress', 'review', 'testing', 'done', 'custom'), defaultValue: 'custom' },
      color: { type: Sequelize.STRING(7), defaultValue: '#6c757d' },
      position: { type: Sequelize.INTEGER, defaultValue: 0 },
      wip_limit: { type: Sequelize.INTEGER },
      is_start_column: { type: Sequelize.BOOLEAN, defaultValue: false },
      is_end_column: { type: Sequelize.BOOLEAN, defaultValue: false },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('board_columns', ['board_id', 'position']);

    await queryInterface.createTable('waterfall_phases', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING(100), allowNull: false },
      phase_type: { type: Sequelize.ENUM('requirements', 'design', 'implementation', 'testing', 'deployment', 'maintenance', 'custom'), defaultValue: 'custom' },
      description: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('not_started', 'in_progress', 'completed', 'on_hold', 'cancelled'), defaultValue: 'not_started' },
      start_date: { type: Sequelize.DATE, allowNull: false },
      end_date: { type: Sequelize.DATE, allowNull: false },
      actual_start_date: { type: Sequelize.DATE },
      actual_end_date: { type: Sequelize.DATE },
      position: { type: Sequelize.INTEGER, defaultValue: 0 },
      completion_percentage: { type: Sequelize.INTEGER, defaultValue: 0 },
      deliverables: { type: Sequelize.JSONB, defaultValue: [] },
      exit_criteria: { type: Sequelize.JSONB, defaultValue: [] },
      signoff_required: { type: Sequelize.BOOLEAN, defaultValue: true },
      signed_off_by: { type: Sequelize.UUID, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      signed_off_at: { type: Sequelize.DATE },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('waterfall_phases', ['project_id', 'position']);

    await queryInterface.createTable('project_milestones', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT },
      due_date: { type: Sequelize.DATE, allowNull: false },
      completed_date: { type: Sequelize.DATE },
      status: { type: Sequelize.ENUM('upcoming', 'at_risk', 'achieved', 'missed'), defaultValue: 'upcoming' },
      is_critical: { type: Sequelize.BOOLEAN, defaultValue: false },
      deliverables: { type: Sequelize.JSONB, defaultValue: [] },
      dependencies: { type: Sequelize.ARRAY(Sequelize.UUID), defaultValue: [] },
      owner_id: { type: Sequelize.UUID, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('project_milestones', ['project_id']);
    await queryInterface.addIndex('project_milestones', ['due_date']);

    // Step 3: Create tasks table (without self-referencing FK)
    
    await queryInterface.createTable('tasks', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      task_number: { type: Sequelize.STRING(50), allowNull: false, unique: true },
      project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      task_type_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'task_types', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      parent_task_id: { type: Sequelize.UUID }, // FK added later
      sprint_id: { type: Sequelize.UUID, references: { model: 'sprints', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      title: { type: Sequelize.STRING(255), allowNull: false },
      description: { type: Sequelize.TEXT },
      acceptance_criteria: { type: Sequelize.TEXT },
      status: { type: Sequelize.ENUM('backlog', 'todo', 'in_progress', 'in_review', 'testing', 'done', 'closed', 'cancelled'), defaultValue: 'backlog' },
      priority: { type: Sequelize.ENUM('lowest', 'low', 'medium', 'high', 'highest', 'critical'), defaultValue: 'medium' },
      severity: { type: Sequelize.ENUM('trivial', 'minor', 'major', 'critical', 'blocker') },
      story_points: { type: Sequelize.INTEGER },
      estimated_hours: { type: Sequelize.DECIMAL(10, 2) },
      actual_hours: { type: Sequelize.DECIMAL(10, 2), defaultValue: 0 },
      remaining_hours: { type: Sequelize.DECIMAL(10, 2) },
      due_date: { type: Sequelize.DATE },
      start_date: { type: Sequelize.DATE },
      completed_date: { type: Sequelize.DATE },
      assignee_id: { type: Sequelize.UUID, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      reporter_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      board_column_id: { type: Sequelize.UUID, references: { model: 'board_columns', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      column_position: { type: Sequelize.INTEGER, defaultValue: 0 },
      is_billable: { type: Sequelize.BOOLEAN, defaultValue: true },
      billable_rate: { type: Sequelize.DECIMAL(10, 2) },
      environment: { type: Sequelize.ENUM('production', 'staging', 'development', 'testing', 'other') },
      affected_version: { type: Sequelize.STRING(50) },
      fixed_version: { type: Sequelize.STRING(50) },
      resolution: { type: Sequelize.ENUM('fixed', 'wont_fix', 'duplicate', 'cannot_reproduce', 'works_as_designed', 'deferred') },
      labels: { type: Sequelize.ARRAY(Sequelize.STRING), defaultValue: [] },
      watchers: { type: Sequelize.ARRAY(Sequelize.UUID), defaultValue: [] },
      attachments: { type: Sequelize.JSONB, defaultValue: [] },
      custom_fields: { type: Sequelize.JSONB, defaultValue: {} },
      metadata: { type: Sequelize.JSONB, defaultValue: {} },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });

    // Add self-referencing FK after table exists
    await queryInterface.addConstraint('tasks', {
      fields: ['parent_task_id'],
      type: 'foreign key',
      name: 'tasks_parent_task_id_fkey',
      references: { table: 'tasks', field: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE'
    });

    await queryInterface.addIndex('tasks', ['project_id']);
    await queryInterface.addIndex('tasks', ['task_type_id']);
    await queryInterface.addIndex('tasks', ['parent_task_id']);
    await queryInterface.addIndex('tasks', ['sprint_id']);
    await queryInterface.addIndex('tasks', ['status']);
    await queryInterface.addIndex('tasks', ['priority']);
    await queryInterface.addIndex('tasks', ['assignee_id']);
    await queryInterface.addIndex('tasks', ['reporter_id']);
    await queryInterface.addIndex('tasks', ['board_column_id', 'column_position']);
    await queryInterface.addIndex('tasks', ['due_date']);

    // Step 4: Create tables depending on tasks
    
    await queryInterface.createTable('time_entries', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      employee_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      date: { type: Sequelize.DATEONLY, allowNull: false },
      start_time: { type: Sequelize.TIME },
      end_time: { type: Sequelize.TIME },
      hours: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      description: { type: Sequelize.TEXT },
      is_billable: { type: Sequelize.BOOLEAN, defaultValue: true },
      billable_rate: { type: Sequelize.DECIMAL(10, 2) },
      billable_amount: { type: Sequelize.DECIMAL(15, 2) },
      invoice_id: { type: Sequelize.UUID },
      is_invoiced: { type: Sequelize.BOOLEAN, defaultValue: false },
      invoiced_at: { type: Sequelize.DATE },
      approved_by: { type: Sequelize.UUID, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      approved_at: { type: Sequelize.DATE },
      status: { type: Sequelize.ENUM('draft', 'submitted', 'approved', 'rejected', 'invoiced'), defaultValue: 'draft' },
      notes: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('time_entries', ['task_id']);
    await queryInterface.addIndex('time_entries', ['project_id']);
    await queryInterface.addIndex('time_entries', ['employee_id']);
    await queryInterface.addIndex('time_entries', ['date']);
    await queryInterface.addIndex('time_entries', ['is_billable']);
    await queryInterface.addIndex('time_entries', ['status']);

    await queryInterface.createTable('task_dependencies', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      depends_on_task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      dependency_type: { type: Sequelize.ENUM('blocks', 'blocked_by', 'relates_to', 'duplicates', 'duplicated_by'), defaultValue: 'blocks' },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('task_dependencies', ['task_id']);
    await queryInterface.addIndex('task_dependencies', ['depends_on_task_id']);
    await queryInterface.addConstraint('task_dependencies', {
      fields: ['task_id', 'depends_on_task_id'],
      type: 'unique',
      name: 'task_dependencies_unique'
    });

    await queryInterface.createTable('task_comments', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      author_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      comment: { type: Sequelize.TEXT, allowNull: false },
      is_internal: { type: Sequelize.BOOLEAN, defaultValue: false },
      attachments: { type: Sequelize.JSONB, defaultValue: [] },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('task_comments', ['task_id', 'created_at']);

    await queryInterface.createTable('task_labels', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      name: { type: Sequelize.STRING(50), allowNull: false },
      color: { type: Sequelize.STRING(7), defaultValue: '#6c757d' },
      description: { type: Sequelize.TEXT },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('task_labels', ['project_id']);
    await queryInterface.addConstraint('task_labels', {
      fields: ['project_id', 'name'],
      type: 'unique',
      name: 'task_labels_project_name_unique'
    });

    await queryInterface.createTable('task_history', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      changed_by: { type: Sequelize.UUID, allowNull: false, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'RESTRICT' },
      field_name: { type: Sequelize.STRING(100), allowNull: false },
      old_value: { type: Sequelize.TEXT },
      new_value: { type: Sequelize.TEXT },
      change_type: { type: Sequelize.ENUM('created', 'updated', 'deleted', 'moved', 'assigned', 'status_changed'), allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('task_history', ['task_id', 'created_at']);

    await queryInterface.createTable('task_baselines', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      baseline_name: { type: Sequelize.STRING(100), defaultValue: 'Initial Baseline' },
      baseline_start_date: { type: Sequelize.DATE, allowNull: false },
      baseline_end_date: { type: Sequelize.DATE, allowNull: false },
      baseline_hours: { type: Sequelize.DECIMAL(10, 2) },
      baseline_cost: { type: Sequelize.DECIMAL(15, 2) },
      variance_days: { type: Sequelize.INTEGER },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('task_baselines', ['task_id']);

    await queryInterface.createTable('critical_path', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      task_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'tasks', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      position: { type: Sequelize.INTEGER, allowNull: false },
      earliest_start: { type: Sequelize.DATE, allowNull: false },
      earliest_finish: { type: Sequelize.DATE, allowNull: false },
      latest_start: { type: Sequelize.DATE, allowNull: false },
      latest_finish: { type: Sequelize.DATE, allowNull: false },
      slack_days: { type: Sequelize.INTEGER, defaultValue: 0 },
      is_critical: { type: Sequelize.BOOLEAN, defaultValue: false },
      calculated_at: { type: Sequelize.DATE, allowNull: false },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('critical_path', ['project_id', 'position']);
    await queryInterface.addIndex('critical_path', ['task_id']);
    await queryInterface.addIndex('critical_path', ['is_critical']);

    // Step 5: Create remaining tables

    await queryInterface.createTable('board_templates', {
      id: { type: Sequelize.UUID, defaultValue: Sequelize.UUIDV4, primaryKey: true },
      name: { type: Sequelize.STRING(100), allowNull: false },
      description: { type: Sequelize.TEXT },
      methodology: { type: Sequelize.ENUM('agile', 'scrum', 'kanban', 'waterfall', 'scrumban', 'safe', 'lean', 'custom'), defaultValue: 'kanban' },
      board_type: { type: Sequelize.ENUM('kanban', 'scrum', 'gantt', 'timeline', 'custom'), defaultValue: 'kanban' },
      is_system: { type: Sequelize.BOOLEAN, defaultValue: false },
      is_public: { type: Sequelize.BOOLEAN, defaultValue: true },
      columns_config: { type: Sequelize.JSONB, defaultValue: [] },
      settings: { type: Sequelize.JSONB, defaultValue: {} },
      created_by: { type: Sequelize.UUID, references: { model: 'employees', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'SET NULL' },
      created_at: { type: Sequelize.DATE, allowNull: false },
      updated_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addIndex('board_templates', ['methodology']);
    await queryInterface.addIndex('board_templates', ['is_public']);

    await queryInterface.createTable('project_products', {
      project_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'projects', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      product_id: { type: Sequelize.UUID, allowNull: false, references: { model: 'products', key: 'id' }, onUpdate: 'CASCADE', onDelete: 'CASCADE' },
      created_at: { type: Sequelize.DATE, allowNull: false }
    });
    await queryInterface.addConstraint('project_products', {
      fields: ['project_id', 'product_id'],
      type: 'primary key',
      name: 'project_products_pkey'
    });

    console.log('✅ Project Management module created successfully!');
    console.log('');
    console.log('📋 Core Tables: task_types, tasks, sprints, boards, board_columns');
    console.log('💬 Collaboration: task_dependencies, task_comments, task_labels, task_history');
    console.log('💰 ERP: time_entries (billable/non-billable tracking)');
    console.log('📊 Gantt & Timeline: project_milestones, task_baselines, critical_path');
    console.log('🌊 Waterfall: waterfall_phases with sign-offs');
    console.log('📦 Product Management: products, project_products');
    console.log('🎯 Templates: board_templates (Agile, Scrum, Kanban, Waterfall, SAFe, Lean)');
    console.log('');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('project_products');
    await queryInterface.dropTable('board_templates');
    await queryInterface.dropTable('critical_path');
    await queryInterface.dropTable('task_baselines');
    await queryInterface.dropTable('task_history');
    await queryInterface.dropTable('task_labels');
    await queryInterface.dropTable('task_comments');
    await queryInterface.dropTable('task_dependencies');
    await queryInterface.dropTable('time_entries');
    await queryInterface.dropTable('tasks');
    await queryInterface.dropTable('project_milestones');
    await queryInterface.dropTable('waterfall_phases');
    await queryInterface.dropTable('board_columns');
    await queryInterface.dropTable('boards');
    await queryInterface.dropTable('sprints');
    await queryInterface.dropTable('products');
    await queryInterface.dropTable('task_types');
  }
};
