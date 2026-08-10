/**
 * Business Operations Hub - Seed Script
 * Creates a comprehensive application integrating lowcode, forge, and services
 */

const { sequelize } = require('../config/database');
const models = require('../lowcode/models');

async function seedBusinessHub() {
  try {
    console.log('Starting Business Operations Hub installation...\n');

    // Owner ID (using placeholder - in production would use actual authenticated user)
    const ownerId = '00000000-0000-0000-0000-000000000001';

    // Step 1: Create Application
    console.log('Creating application...');
    const app = await models.Application.create({
      name: 'business_operations_hub',
      displayName: 'Business Operations Hub',
      description: 'Comprehensive business management application integrating CRM, project management, task tracking, and team collaboration.',
      version: '1.0.0',
      status: 'active',
      ownerId,
      icon: 'briefcase',
      color: '#0078D4',
      settings: {
        enableNotifications: true,
        enableWorkflows: true,
        enableAnalytics: true,
        theme: 'professional'
      },
      metadata: {
        category: 'business',
        tags: ['crm', 'project-management', 'erp', 'collaboration'],
        integrations: {
          forge: ['contacts', 'companies', 'customers', 'invoices'],
          services: ['workflow', 'herald', 'timeline'],
          lowcode: ['entities', 'forms', 'grids']
        }
      }
    });

    console.log(`✓ Created application: ${app.id}\n`);

    // Step 2: Create Entities
    console.log('Creating entities...');

    const projectEntity = await models.Entity.create({
      applicationId: app.id,
      name: 'project',
      displayName: 'Project',
      pluralName: 'Projects',
      description: 'Project tracking with budget, timeline, and deliverables',
      tableName: 'hub_projects',
      schema: {
        fields: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'project_number', type: 'string', length: 50, unique: true, required: true },
          { name: 'name', type: 'string', length: 255, required: true },
          { name: 'description', type: 'text' },
          { name: 'customer_id', type: 'uuid', description: 'FK to Forge ERP customers' },
          { name: 'status', type: 'enum', enumValues: ['planning', 'in-progress', 'on-hold', 'completed', 'cancelled'], defaultValue: 'planning' },
          { name: 'priority', type: 'enum', enumValues: ['low', 'medium', 'high', 'critical'], defaultValue: 'medium' },
          { name: 'start_date', type: 'date', required: true },
          { name: 'end_date', type: 'date', required: true },
          { name: 'budget', type: 'decimal', precision: 15, scale: 2, defaultValue: 0 },
          { name: 'progress_percentage', type: 'integer', defaultValue: 0 }
        ]
      },
      relationships: [
        { name: 'customer', type: 'belongsTo', targetEntity: 'forge:customers', foreignKey: 'customer_id' },
        { name: 'tasks', type: 'hasMany', targetEntity: 'task', foreignKey: 'project_id' }
      ],
      sourceType: 'custom',
      enableAudit: true,
      enableVersioning: true,
      softDelete: true,
      metadata: { displayField: 'name', icon: 'folder-open', color: '#0078D4' }
    });

    const taskEntity = await models.Entity.create({
      applicationId: app.id,
      name: 'task',
      displayName: 'Task',
      pluralName: 'Tasks',
      description: 'Task management with assignments and due dates',
      tableName: 'hub_tasks',
      schema: {
        fields: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'task_number', type: 'string', length: 50, unique: true, required: true },
          { name: 'project_id', type: 'uuid', required: true },
          { name: 'title', type: 'string', length: 255, required: true },
          { name: 'description', type: 'text' },
          { name: 'assigned_to_contact_id', type: 'uuid', description: 'FK to Forge CRM contacts' },
          { name: 'status', type: 'enum', enumValues: ['todo', 'in-progress', 'review', 'done', 'blocked'], defaultValue: 'todo' },
          { name: 'priority', type: 'enum', enumValues: ['low', 'medium', 'high', 'urgent'], defaultValue: 'medium' },
          { name: 'due_date', type: 'date', required: true },
          { name: 'estimated_hours', type: 'decimal', precision: 8, scale: 2 }
        ]
      },
      relationships: [
        { name: 'project', type: 'belongsTo', targetEntity: 'project', foreignKey: 'project_id' },
        { name: 'assignedContact', type: 'belongsTo', targetEntity: 'forge:contacts', foreignKey: 'assigned_to_contact_id' }
      ],
      sourceType: 'custom',
      enableAudit: true,
      softDelete: true,
      metadata: {
        displayField: 'title',
        workflowTriggers: {
          onCreate: 'task_created_notification',
          onStatusChange: 'task_status_changed'
        }
      }
    });

    const teamMemberEntity = await models.Entity.create({
      applicationId: app.id,
      name: 'team_member',
      displayName: 'Team Member',
      pluralName: 'Team Members',
      description: 'Team member profiles with skills and availability',
      tableName: 'hub_team_members',
      schema: {
        fields: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'contact_id', type: 'uuid', required: true, description: 'FK to Forge CRM contacts' },
          { name: 'role', type: 'string', length: 100, required: true },
          { name: 'department', type: 'string', length: 100 },
          { name: 'skills', type: 'array', itemType: 'string' },
          { name: 'hourly_rate', type: 'decimal', precision: 10, scale: 2 },
          { name: 'availability_status', type: 'enum', enumValues: ['available', 'busy', 'on-leave', 'offline'], defaultValue: 'available' }
        ]
      },
      relationships: [
        { name: 'contact', type: 'belongsTo', targetEntity: 'forge:contacts', foreignKey: 'contact_id' }
      ],
      sourceType: 'custom',
      softDelete: true,
      metadata: { displayField: 'role' }
    });

    const customerProfileEntity = await models.Entity.create({
      applicationId: app.id,
      name: 'customer_profile',
      displayName: 'Customer Profile',
      pluralName: 'Customer Profiles',
      description: 'Integration with Forge ERP customers table',
      sourceType: 'forge',
      sourceConfig: {
        forgeModule: 'erp',
        forgeTable: 'customers',
        apiEndpoint: '/forge/erp/customers',
        permissions: { read: true, write: true, delete: false }
      },
      softDelete: true,
      metadata: { displayField: 'name', icon: 'users' }
    });

    const contactAssignmentEntity = await models.Entity.create({
      applicationId: app.id,
      name: 'contact_assignment',
      displayName: 'Contact Assignment',
      pluralName: 'Contact Assignments',
      description: 'Links Forge CRM contacts to projects with roles',
      tableName: 'hub_contact_assignments',
      schema: {
        fields: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'project_id', type: 'uuid', required: true },
          { name: 'contact_id', type: 'uuid', required: true, description: 'FK to Forge CRM contacts' },
          { name: 'role_in_project', type: 'string', length: 100, required: true },
          { name: 'start_date', type: 'date', required: true },
          { name: 'is_active', type: 'boolean', defaultValue: true }
        ]
      },
      relationships: [
        { name: 'project', type: 'belongsTo', targetEntity: 'project', foreignKey: 'project_id' },
        { name: 'contact', type: 'belongsTo', targetEntity: 'forge:contacts', foreignKey: 'contact_id' }
      ],
      sourceType: 'custom',
      metadata: { displayField: 'role_in_project' }
    });

    console.log(`✓ Created 5 entities\n`);

    // Step 3: Create Forms (simplified - just metadata, actual form UI would be built in designer)
    console.log('Creating forms...');

    const projectForm = await models.AppForm.create({
      applicationId: app.id,
      name: 'project_form',
      displayName: 'Project Management Form',
      description: 'Create and edit projects with customer linking',
      formType: 'standard',
      layout: 'two-column',
      controls: [{ id: 'ctrl_name', type: 'textInput', name: 'name', label: 'Project Name', required: true }],
      dataSources: [
        { name: 'projectEntity', type: 'entity', entityId: projectEntity.id, mode: 'twoWay' }
      ],
      status: 'published',
      version: '1.0.0',
      metadata: { icon: 'folder-open', category: 'project-management' }
    });

    const taskForm = await models.AppForm.create({
      applicationId: app.id,
      name: 'task_form',
      displayName: 'Task Entry Form',
      description: 'Create and manage tasks',
      formType: 'standard',
      layout: 'single-column',
      controls: [{ id: 'ctrl_title', type: 'textInput', name: 'title', label: 'Task Title', required: true }],
      dataSources: [
        { name: 'taskEntity', type: 'entity', entityId: taskEntity.id, mode: 'twoWay' }
      ],
      status: 'published',
      version: '1.0.0',
      metadata: { icon: 'check-square', integrations: ['workflow', 'herald'] }
    });

    const teamForm = await models.AppForm.create({
      applicationId: app.id,
      name: 'team_member_form',
      displayName: 'Team Member Form',
      description: 'Manage team member profiles',
      formType: 'standard',
      layout: 'single-column',
      controls: [{ id: 'ctrl_role', type: 'textInput', name: 'role', label: 'Role', required: true }],
      dataSources: [
        { name: 'teamMemberEntity', type: 'entity', entityId: teamMemberEntity.id }
      ],
      status: 'published',
      version: '1.0.0'
    });

    console.log(`✓ Created 3 forms\n`);

    // Step 4: Create Grids
    console.log('Creating grids...');

    const projectsGrid = await models.Grid.create({
      applicationId: app.id,
      entityId: projectEntity.id,
      name: 'projects_grid',
      displayName: 'Projects Overview',
      description: 'Master grid showing all projects',
      gridType: 'editable',
      columns: [
        { name: 'Project #', field: 'project_number', width: 120, sortable: true },
        { name: 'Name', field: 'name', width: 200, sortable: true },
        { name: 'Status', field: 'status', width: 120 },
        { name: 'Priority', field: 'priority', width: 100 }
      ],
      dataSource: { type: 'entity', entityId: projectEntity.id, include: ['customer'] },
      actions: [
        { name: 'edit', label: 'Edit', icon: 'edit', action: 'openForm', formId: projectForm.id }
      ],
      pagination: { enabled: true, pageSize: 25 }
    });

    const tasksGrid = await models.Grid.create({
      applicationId: app.id,
      entityId: taskEntity.id,
      name: 'tasks_grid',
      displayName: 'Tasks Board',
      description: 'All tasks with assignments',
      gridType: 'editable',
      columns: [
        { name: 'Task #', field: 'task_number', width: 100 },
        { name: 'Title', field: 'title', width: 250 },
        { name: 'Status', field: 'status', width: 120 },
        { name: 'Due Date', field: 'due_date', width: 120 }
      ],
      dataSource: { type: 'entity', entityId: taskEntity.id, include: ['project', 'assignedContact'] },
      actions: [
        { name: 'edit', label: 'Edit', icon: 'edit', action: 'openForm', formId: taskForm.id }
      ],
      pagination: { enabled: true, pageSize: 50 }
    });

    const teamGrid = await models.Grid.create({
      applicationId: app.id,
      entityId: teamMemberEntity.id,
      name: 'team_members_grid',
      displayName: 'Team Directory',
      description: 'Team member directory',
      gridType: 'readonly',
      columns: [
        { name: 'Role', field: 'role', width: 150 },
        { name: 'Department', field: 'department', width: 150 },
        { name: 'Availability', field: 'availability_status', width: 120 }
      ],
      dataSource: { type: 'entity', entityId: teamMemberEntity.id, include: ['contact'] }
    });

    console.log(`✓ Created 3 grids\n`);

    // Success!
    console.log('================================================');
    console.log('Business Operations Hub - Installation Complete!');
    console.log('================================================');
    console.log(`Application ID: ${app.id}`);
    console.log('');
    console.log('Created:');
    console.log('  - 1 Application');
    console.log('  - 5 Entities (Project, Task, TeamMember, CustomerProfile, ContactAssignment)');
    console.log('  - 3 Forms');
    console.log('  - 3 Grids');
    console.log('');
    console.log('Integrations: Forge CRM-ERP + Workflow + Herald + Timeline');
    console.log('================================================\n');

    return app;

  } catch (error) {
    console.error('Error seeding Business Hub:', error);
    throw error;
  }
}

// Run if called directly
if (require.main === module) {
  seedBusinessHub()
    .then(() => {
      console.log('Seed completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    });
}

module.exports = seedBusinessHub;
