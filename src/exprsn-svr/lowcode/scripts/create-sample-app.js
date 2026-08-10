/**
 * Create Sample Application: Project Management System
 *
 * This script creates a complete, production-ready project management application
 * that demonstrates all Low-Code Platform features:
 * - Multiple related entities
 * - Forms with data binding and validation
 * - Grids with filtering and sorting
 * - Application settings and variables
 * - Complex relationships and business logic
 */

const fetch = require('node-fetch');
const https = require('https');

// Create an agent that accepts self-signed certificates
const httpsAgent = new https.Agent({
  rejectUnauthorized: false
});

const BASE_URL = 'https://localhost:5001/lowcode/api';

// Helper function for API calls
async function apiCall(method, endpoint, data = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
    agent: httpsAgent
  };

  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, options);
  const result = await response.json();

  if (!result.success) {
    const errorMsg = result.message || result.error;
    const errorStr = typeof errorMsg === 'object' ? JSON.stringify(errorMsg) : errorMsg;
    throw new Error(`API Error: ${errorStr}`);
  }

  return result.data;
}

async function createSampleApplication() {
  console.log('🚀 Creating Project Management System...\n');

  try {
    // ============================================================================
    // STEP 1: Create Application
    // ============================================================================
    console.log('📱 Step 1: Creating application...');
    const application = await apiCall('POST', '/applications', {
      name: 'project-manager',
      description: 'Complete project management solution with tasks, teams, and collaboration features'
    });
    console.log(`✅ Application created: ${application.id}\n`);

    const appId = application.id;

    // ============================================================================
    // STEP 2: Create Default Settings
    // ============================================================================
    console.log('⚙️  Step 2: Creating application settings...');
    const settings = await apiCall('POST', '/settings/defaults', {
      applicationId: appId
    });
    console.log(`✅ Created ${settings.length} default settings\n`);

    // Create custom settings for project management
    const customSettings = [
      {
        applicationId: appId,
        key: 'defaultProjectDuration',
        description: 'Default duration for new projects',
        category: 'general',
        dataType: 'number',
        value: '30',
        defaultValue: '30',
        validationRules: { min: 1, max: 365 }
      },
      {
        applicationId: appId,
        key: 'taskStatuses',
        description: 'Available task statuses',
        category: 'general',
        dataType: 'array',
        value: JSON.stringify(['Not Started', 'In Progress', 'Review', 'Completed', 'Blocked']),
        defaultValue: JSON.stringify(['Not Started', 'In Progress', 'Review', 'Completed', 'Blocked'])
      },
      {
        applicationId: appId,
        key: 'priorities',
        description: 'Available priority levels',
        category: 'general',
        dataType: 'array',
        value: JSON.stringify(['Low', 'Medium', 'High', 'Critical']),
        defaultValue: JSON.stringify(['Low', 'Medium', 'High', 'Critical'])
      },
      {
        applicationId: appId,
        key: 'enableTimeTracking',
        description: 'Allow users to track time on tasks',
        category: 'features',
        dataType: 'boolean',
        value: 'true',
        defaultValue: 'true'
      },
      {
        applicationId: appId,
        key: 'maxTasksPerProject',
        description: 'Maximum number of tasks allowed per project',
        category: 'general',
        dataType: 'number',
        value: '100',
        defaultValue: '100',
        validationRules: { min: 10, max: 1000 }
      }
    ];

    for (const setting of customSettings) {
      await apiCall('POST', '/settings', setting);
    }
    console.log(`✅ Created ${customSettings.length} custom settings\n`);

    // ============================================================================
    // STEP 3: Create Entities
    // ============================================================================
    console.log('📊 Step 3: Creating data entities...');

    // Entity 1: Projects
    const projectEntity = await apiCall('POST', '/entities', {
      applicationId: appId,
      name: 'projects',
      description: 'Project definitions and metadata',
      schema: {
        fields: [
          {
            name: 'id',
            type: 'uuid',
          },
          {
            name: 'name',
            type: 'string',
            required: true,
            maxLength: 255
          },
          {
            name: 'description',
            type: 'text',
            required: false
          },
          {
            name: 'status',
            type: 'enum',
            required: true,
            defaultValue: 'Planning',
            options: ['Planning', 'Active', 'On Hold', 'Completed', 'Cancelled']
          },
          {
            name: 'priority',
            type: 'enum',
            required: true,
            defaultValue: 'Medium',
            options: ['Low', 'Medium', 'High', 'Critical']
          },
          {
            name: 'startDate',
            type: 'date',
            required: true
          },
          {
            name: 'endDate',
            type: 'date',
            required: true
          },
          {
            name: 'budget',
            type: 'decimal',
            required: false,
            precision: 10,
            scale: 2
          },
          {
            name: 'progress',
            type: 'integer',
            required: true,
            defaultValue: 0,
            min: 0,
            max: 100
          },
          {
            name: 'ownerId',
            type: 'uuid',
            required: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
          }
        ],
        indexes: [
          { fields: ['status'] },
          { fields: ['priority'] },
          { fields: ['ownerId'] },
          { fields: ['startDate', 'endDate'] }
        ]
      },
      status: 'active'
    });
    console.log(`✅ Created entity: Projects (${projectEntity.id})`);

    // Entity 2: Tasks
    const taskEntity = await apiCall('POST', '/entities', {
      applicationId: appId,
      name: 'tasks',
      description: 'Project tasks and assignments',
      schema: {
        fields: [
          {
            name: 'id',
            type: 'uuid',
          },
          {
            name: 'projectId',
            type: 'uuid',
            required: true,
            references: {
              entity: 'projects',
              field: 'id',
              onDelete: 'CASCADE'
            }
          },
          {
            name: 'title',
            type: 'string',
            required: true,
            maxLength: 255
          },
          {
            name: 'description',
            type: 'text',
            required: false
          },
          {
            name: 'status',
            type: 'enum',
            required: true,
            defaultValue: 'Not Started',
            options: ['Not Started', 'In Progress', 'Review', 'Completed', 'Blocked']
          },
          {
            name: 'priority',
            type: 'enum',
            required: true,
            defaultValue: 'Medium',
            options: ['Low', 'Medium', 'High', 'Critical']
          },
          {
            name: 'assignedTo',
            type: 'uuid',
            required: false
          },
          {
            name: 'estimatedHours',
            type: 'decimal',
            required: false,
            precision: 5,
            scale: 2
          },
          {
            name: 'actualHours',
            type: 'decimal',
            required: false,
            precision: 5,
            scale: 2
          },
          {
            name: 'dueDate',
            type: 'date',
            required: false
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            required: false
          },
          {
            name: 'tags',
            type: 'json',
            required: false
          },
          {
            name: 'createdAt',
            type: 'timestamp',
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
          }
        ],
        indexes: [
          { fields: ['projectId'] },
          { fields: ['status'] },
          { fields: ['assignedTo'] },
          { fields: ['dueDate'] },
          { fields: ['priority', 'status'] }
        ]
      },
      status: 'active'
    });
    console.log(`✅ Created entity: Tasks (${taskEntity.id})`);

    // Entity 3: Team Members
    const teamMemberEntity = await apiCall('POST', '/entities', {
      applicationId: appId,
      name: 'team_members',
      description: 'Project team members and roles',
      schema: {
        fields: [
          {
            name: 'id',
            type: 'uuid',
          },
          {
            name: 'firstName',
            type: 'string',
            required: true,
            maxLength: 100
          },
          {
            name: 'lastName',
            type: 'string',
            required: true,
            maxLength: 100
          },
          {
            name: 'email',
            type: 'string',
            required: true,
            maxLength: 255,
            unique: true
          },
          {
            name: 'role',
            type: 'enum',
            required: true,
            options: ['Developer', 'Designer', 'Project Manager', 'QA Engineer', 'DevOps', 'Business Analyst']
          },
          {
            name: 'department',
            type: 'string',
            required: false,
            maxLength: 100
          },
          {
            name: 'hourlyRate',
            type: 'decimal',
            required: false,
            precision: 8,
            scale: 2
          },
          {
            name: 'availability',
            type: 'integer',
            required: true,
            defaultValue: 100,
            min: 0,
            max: 100
          },
          {
            name: 'isActive',
            type: 'boolean',
            required: true,
            defaultValue: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
          }
        ],
        indexes: [
          { fields: ['email'], unique: true },
          { fields: ['role'] },
          { fields: ['isActive'] }
        ]
      },
      status: 'active'
    });
    console.log(`✅ Created entity: Team Members (${teamMemberEntity.id})`);

    // Entity 4: Comments
    const commentEntity = await apiCall('POST', '/entities', {
      applicationId: appId,
      name: 'comments',
      description: 'Task and project comments',
      schema: {
        fields: [
          {
            name: 'id',
            type: 'uuid',
          },
          {
            name: 'entityType',
            type: 'enum',
            required: true,
            options: ['project', 'task']
          },
          {
            name: 'entityId',
            type: 'uuid',
            required: true
          },
          {
            name: 'userId',
            type: 'uuid',
            required: true
          },
          {
            name: 'content',
            type: 'text',
            required: true
          },
          {
            name: 'createdAt',
            type: 'timestamp',
          }
        ],
        indexes: [
          { fields: ['entityType', 'entityId'] },
          { fields: ['userId'] }
        ]
      },
      status: 'active'
    });
    console.log(`✅ Created entity: Comments (${commentEntity.id})\n`);

    // ============================================================================
    // STEP 4: Create Forms
    // ============================================================================
    console.log('📝 Step 4: Creating forms...');

    // Form 1: Project Form
    const projectForm = await apiCall('POST', '/forms', {
      applicationId: appId,
      name: 'project-form',
      description: 'Create and edit projects',
      type: 'form',
      isStartForm: true,
      controls: [
        {
          id: 'heading1',
          type: 'heading',
          name: 'formTitle',
          props: {
            text: 'Project Details',
            level: 2
          }
        },
        {
          id: 'name',
          type: 'text',
          name: 'name',
          props: {
            label: 'Project Name',
            placeholder: 'Enter project name',
            required: true,
            maxLength: 255
          },
          validation: {
            required: true,
            minLength: 3
          }
        },
        {
          id: 'description',
          type: 'textarea',
          name: 'description',
          props: {
            label: 'Description',
            placeholder: 'Describe the project objectives and scope',
            rows: 4
          }
        },
        {
          id: 'statusRow',
          type: 'row',
          name: 'statusRow',
          props: { columns: 2 },
          children: [
            {
              id: 'status',
              type: 'select',
              name: 'status',
              props: {
                label: 'Status',
                options: [
                  { value: 'Planning', label: 'Planning' },
                  { value: 'Active', label: 'Active' },
                  { value: 'On Hold', label: 'On Hold' },
                  { value: 'Completed', label: 'Completed' },
                  { value: 'Cancelled', label: 'Cancelled' }
                ],
                defaultValue: 'Planning'
              }
            },
            {
              id: 'priority',
              type: 'select',
              name: 'priority',
              props: {
                label: 'Priority',
                options: [
                  { value: 'Low', label: 'Low' },
                  { value: 'Medium', label: 'Medium' },
                  { value: 'High', label: 'High' },
                  { value: 'Critical', label: 'Critical' }
                ],
                defaultValue: 'Medium'
              }
            }
          ]
        },
        {
          id: 'dateRow',
          type: 'row',
          name: 'dateRow',
          props: { columns: 2 },
          children: [
            {
              id: 'startDate',
              type: 'date',
              name: 'startDate',
              props: {
                label: 'Start Date',
                required: true
              }
            },
            {
              id: 'endDate',
              type: 'date',
              name: 'endDate',
              props: {
                label: 'End Date',
                required: true
              }
            }
          ]
        },
        {
          id: 'budgetProgress',
          type: 'row',
          name: 'budgetProgress',
          props: { columns: 2 },
          children: [
            {
              id: 'budget',
              type: 'number',
              name: 'budget',
              props: {
                label: 'Budget ($)',
                placeholder: '0.00',
                step: 0.01,
                min: 0
              }
            },
            {
              id: 'progress',
              type: 'slider',
              name: 'progress',
              props: {
                label: 'Progress (%)',
                min: 0,
                max: 100,
                step: 5,
                defaultValue: 0,
                showValue: true
              }
            }
          ]
        },
        {
          id: 'submitRow',
          type: 'row',
          name: 'submitRow',
          props: { columns: 2 },
          children: [
            {
              id: 'cancelBtn',
              type: 'button',
              name: 'cancelBtn',
              props: {
                text: 'Cancel',
                variant: 'secondary',
                onClick: 'cancelForm'
              }
            },
            {
              id: 'submitBtn',
              type: 'button',
              name: 'submitBtn',
              props: {
                text: 'Save Project',
                variant: 'primary',
                type: 'submit'
              }
            }
          ]
        }
      ],
      dataSources: [
        {
          name: 'projectData',
          type: 'entity',
          config: {
            entityId: projectEntity.id,
            entityName: 'projects'
          }
        }
      ],
      variables: [
        {
          name: 'currentProject',
          type: 'object',
          defaultValue: null
        },
        {
          name: 'isEditMode',
          type: 'boolean',
          defaultValue: false
        }
      ],
      events: {
        onLoad: `
          // Load project if editing
          if (params.projectId) {
            variables.isEditMode = true;
            variables.currentProject = await dataSources.projectData.get(params.projectId);
            form.setValues(variables.currentProject);
          }
        `,
        onSubmit: `
          const formData = form.getValues();

          // Validate dates
          if (new Date(formData.endDate) < new Date(formData.startDate)) {
            alert('End date must be after start date');
            return false;
          }

          if (variables.isEditMode) {
            await dataSources.projectData.update(params.projectId, formData);
            alert('Project updated successfully');
          } else {
            await dataSources.projectData.create(formData);
            alert('Project created successfully');
          }

          // Navigate to projects list
          navigate('/projects');
        `
      },
      status: 'published'
    });
    console.log(`✅ Created form: Project Form (${projectForm.id})`);

    // Form 2: Task Form
    const taskForm = await apiCall('POST', '/forms', {
      applicationId: appId,
      name: 'task-form',
      description: 'Create and edit tasks',
      type: 'form',
      controls: [
        {
          id: 'heading1',
          type: 'heading',
          name: 'formTitle',
          props: {
            text: 'Task Details',
            level: 2
          }
        },
        {
          id: 'title',
          type: 'text',
          name: 'title',
          props: {
            label: 'Task Title',
            placeholder: 'Enter task title',
            required: true
          }
        },
        {
          id: 'description',
          type: 'textarea',
          name: 'description',
          props: {
            label: 'Description',
            rows: 3
          }
        },
        {
          id: 'statusPriority',
          type: 'row',
          name: 'statusPriority',
          props: { columns: 2 },
          children: [
            {
              id: 'status',
              type: 'select',
              name: 'status',
              props: {
                label: 'Status',
                options: [
                  { value: 'Not Started', label: 'Not Started' },
                  { value: 'In Progress', label: 'In Progress' },
                  { value: 'Review', label: 'Review' },
                  { value: 'Completed', label: 'Completed' },
                  { value: 'Blocked', label: 'Blocked' }
                ]
              }
            },
            {
              id: 'priority',
              type: 'select',
              name: 'priority',
              props: {
                label: 'Priority',
                options: [
                  { value: 'Low', label: 'Low' },
                  { value: 'Medium', label: 'Medium' },
                  { value: 'High', label: 'High' },
                  { value: 'Critical', label: 'Critical' }
                ]
              }
            }
          ]
        },
        {
          id: 'assignment',
          type: 'row',
          name: 'assignment',
          props: { columns: 2 },
          children: [
            {
              id: 'assignedTo',
              type: 'select',
              name: 'assignedTo',
              props: {
                label: 'Assigned To',
                placeholder: 'Select team member',
                dataSource: 'teamMembers'
              }
            },
            {
              id: 'dueDate',
              type: 'date',
              name: 'dueDate',
              props: {
                label: 'Due Date'
              }
            }
          ]
        },
        {
          id: 'hours',
          type: 'row',
          name: 'hours',
          props: { columns: 2 },
          children: [
            {
              id: 'estimatedHours',
              type: 'number',
              name: 'estimatedHours',
              props: {
                label: 'Estimated Hours',
                min: 0,
                step: 0.5
              }
            },
            {
              id: 'actualHours',
              type: 'number',
              name: 'actualHours',
              props: {
                label: 'Actual Hours',
                min: 0,
                step: 0.5
              }
            }
          ]
        },
        {
          id: 'tags',
          type: 'chips',
          name: 'tags',
          props: {
            label: 'Tags',
            placeholder: 'Add tags'
          }
        },
        {
          id: 'submitRow',
          type: 'row',
          name: 'submitRow',
          props: { columns: 2 },
          children: [
            {
              id: 'cancelBtn',
              type: 'button',
              name: 'cancelBtn',
              props: {
                text: 'Cancel',
                variant: 'secondary'
              }
            },
            {
              id: 'submitBtn',
              type: 'button',
              name: 'submitBtn',
              props: {
                text: 'Save Task',
                variant: 'primary',
                type: 'submit'
              }
            }
          ]
        }
      ],
      dataSources: [
        {
          name: 'taskData',
          type: 'entity',
          config: {
            entityId: taskEntity.id,
            entityName: 'tasks'
          }
        },
        {
          name: 'teamMembers',
          type: 'entity',
          config: {
            entityId: teamMemberEntity.id,
            entityName: 'team_members'
          }
        }
      ],
      status: 'published'
    });
    console.log(`✅ Created form: Task Form (${taskForm.id})\n`);

    // ============================================================================
    // STEP 5: Create Grids
    // ============================================================================
    console.log('📋 Step 5: Creating grids...');

    // Grid 1: Projects Grid
    const projectsGrid = await apiCall('POST', '/grids', {
      applicationId: appId,
      name: 'projects-grid',
      description: 'List all projects',
      columns: [
        {
          field: 'name',
          type: 'string',
          sortable: true,
          filterable: true,
          width: 250
        },
        {
          field: 'status',
          type: 'badge',
          sortable: true,
          filterable: true,
          width: 120,
          badge: {
            Planning: 'info',
            Active: 'success',
            'On Hold': 'warning',
            Completed: 'secondary',
            Cancelled: 'danger'
          }
        },
        {
          field: 'priority',
          type: 'badge',
          sortable: true,
          filterable: true,
          width: 100,
          badge: {
            Low: 'secondary',
            Medium: 'info',
            High: 'warning',
            Critical: 'danger'
          }
        },
        {
          field: 'startDate',
          type: 'date',
          sortable: true,
          filterable: true,
          width: 120,
          format: '{{settings.dateFormat}}'
        },
        {
          field: 'endDate',
          type: 'date',
          sortable: true,
          filterable: true,
          width: 120,
          format: '{{settings.dateFormat}}'
        },
        {
          field: 'progress',
          type: 'progress',
          sortable: true,
          width: 150
        },
        {
          field: 'budget',
          type: 'currency',
          sortable: true,
          width: 120,
          format: '$0,0.00'
        }
      ],
      dataSource: {
        type: 'entity',
        entityId: projectEntity.id,
        entityName: 'projects'
      },
      filters: [
        {
          field: 'status',
          operator: 'in',
          value: ['Planning', 'Active']
        }
      ],
      sorting: [
        {
          field: 'priority',
          direction: 'desc'
        },
        {
          field: 'startDate',
          direction: 'asc'
        }
      ],
      pagination: {
        enabled: true,
        pageSize: '{{settings.recordsPerPage}}',
        showSizeSelector: true,
        sizeOptions: [10, 25, 50, 100]
      },
      actions: [
        {
          name: 'edit',
          label: 'Edit',
          icon: 'edit',
          type: 'row',
          onClick: 'editProject'
        },
        {
          name: 'delete',
          label: 'Delete',
          icon: 'trash',
          type: 'row',
          variant: 'danger',
          confirm: true,
          confirmMessage: 'Are you sure you want to delete this project?',
          onClick: 'deleteProject'
        },
        {
          name: 'create',
          label: 'New Project',
          icon: 'plus',
          type: 'toolbar',
          variant: 'primary',
          onClick: 'createProject'
        }
      ],
      styling: {
        striped: true,
        bordered: true,
        hover: true,
        compact: false
      },
      status: 'published'
    });
    console.log(`✅ Created grid: Projects Grid (${projectsGrid.id})`);

    // Grid 2: Tasks Grid
    const tasksGrid = await apiCall('POST', '/grids', {
      applicationId: appId,
      name: 'tasks-grid',
      description: 'List all tasks',
      columns: [
        {
          field: 'title',
          type: 'string',
          sortable: true,
          filterable: true,
          width: 300
        },
        {
          field: 'status',
          type: 'badge',
          sortable: true,
          filterable: true,
          width: 120,
          badge: {
            'Not Started': 'secondary',
            'In Progress': 'primary',
            Review: 'info',
            Completed: 'success',
            Blocked: 'danger'
          }
        },
        {
          field: 'priority',
          type: 'badge',
          sortable: true,
          filterable: true,
          width: 100
        },
        {
          field: 'assignedTo',
          type: 'lookup',
          sortable: true,
          filterable: true,
          width: 150,
          lookup: {
            entity: 'team_members',
            displayField: 'firstName,lastName'
          }
        },
        {
          field: 'dueDate',
          type: 'date',
          sortable: true,
          filterable: true,
          width: 120
        },
        {
          field: 'estimatedHours',
          type: 'number',
          sortable: true,
          width: 100,
          format: '0.0'
        },
        {
          field: 'actualHours',
          type: 'number',
          sortable: true,
          width: 100,
          format: '0.0'
        }
      ],
      dataSource: {
        type: 'entity',
        entityId: taskEntity.id,
        entityName: 'tasks'
      },
      filters: [
        {
          field: 'status',
          operator: 'ne',
          value: 'Completed'
        }
      ],
      sorting: [
        {
          field: 'priority',
          direction: 'desc'
        },
        {
          field: 'dueDate',
          direction: 'asc'
        }
      ],
      pagination: {
        enabled: true,
        pageSize: '{{settings.recordsPerPage}}'
      },
      actions: [
        {
          name: 'edit',
          label: 'Edit',
          icon: 'edit',
          type: 'row'
        },
        {
          name: 'complete',
          label: 'Mark Complete',
          icon: 'check',
          type: 'row',
          variant: 'success'
        },
        {
          name: 'create',
          label: 'New Task',
          icon: 'plus',
          type: 'toolbar',
          variant: 'primary'
        }
      ],
      status: 'published'
    });
    console.log(`✅ Created grid: Tasks Grid (${tasksGrid.id})\n`);

    // ============================================================================
    // SUMMARY
    // ============================================================================
    console.log('✨ Sample Application Created Successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📱 Application: Project Management System');
    console.log(`🆔 App ID: ${appId}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📊 Entities Created (4):');
    console.log(`   • Projects (${projectEntity.id})`);
    console.log(`   • Tasks (${taskEntity.id})`);
    console.log(`   • Team Members (${teamMemberEntity.id})`);
    console.log(`   • Comments (${commentEntity.id})\n`);

    console.log('📝 Forms Created (2):');
    console.log(`   • Project Form (${projectForm.id})`);
    console.log(`   • Task Form (${taskForm.id})\n`);

    console.log('📋 Grids Created (2):');
    console.log(`   • Projects Grid (${projectsGrid.id})`);
    console.log(`   • Tasks Grid (${tasksGrid.id})\n`);

    console.log(`⚙️  Settings: ${settings.length + customSettings.length} total\n`);

    console.log('🌐 Access URLs:');
    console.log(`   App Designer: http://localhost:5000/lowcode/designer?appId=${appId}`);
    console.log(`   Settings:     http://localhost:5000/lowcode/settings?appId=${appId}`);
    console.log(`   Run App:      http://localhost:5000/lowcode/apps/${appId}\n`);

    console.log('✅ All components created and ready to use!');

    return {
      applicationId: appId,
      entities: { projectEntity, taskEntity, teamMemberEntity, commentEntity },
      forms: { projectForm, taskForm },
      grids: { projectsGrid, tasksGrid }
    };

  } catch (error) {
    console.error('\n❌ Error creating sample application:', error.message);
    console.error(error.stack);
    throw error;
  }
}

// Run if executed directly
if (require.main === module) {
  createSampleApplication()
    .then(() => {
      console.log('\n🎉 Script completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n💥 Script failed:', error);
      process.exit(1);
    });
}

module.exports = createSampleApplication;
