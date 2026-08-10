/**
 * Create Full-Featured Example Application
 * Demonstrates ALL Low-Code Platform capabilities:
 * - Application & Entity creation
 * - Form with data binding and validation
 * - Grid with sorting, filtering, and actions
 * - BPMN Process workflow
 * - Charts for data visualization
 * - Dashboard combining everything
 */

const https = require('https');

// Disable SSL verification for self-signed cert
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const BASE_URL = 'https://localhost:5001/lowcode/api';

// Utility function to make HTTP requests
async function apiRequest(method, path, data = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);

    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(url, options, (res) => {
      let body = '';

      res.on('data', (chunk) => {
        body += chunk;
      });

      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          if (response.success) {
            resolve(response.data);
          } else {
            console.error(`API Error: ${response.message || response.error}`);
            console.error('Response:', JSON.stringify(response, null, 2));
            reject(new Error(response.message || JSON.stringify(response.error)));
          }
        } catch (error) {
          console.error('Parse error. Response body:', body);
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      console.error('Request error:', error.message);
      reject(error);
    });

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function createFullExample() {
  console.log('🚀 Creating Full-Featured Task Management Application...\n');

  try {
    // ==========================================
    // STEP 1: Create Application
    // ==========================================
    console.log('📦 Step 1: Creating Application...');

    const timestamp = Date.now();
    const app = await apiRequest('POST', '/applications', {
      name: `task-manager-full-${timestamp}`,
      displayName: 'Task Manager (Full Featured)',
      description: 'Complete task management application demonstrating ALL Low-Code Platform features'
    });

    console.log(`✅ Application created: ${app.displayName} (ID: ${app.id})\n`);
    const appId = app.id;

    // ==========================================
    // STEP 2: Create Task Entity
    // ==========================================
    console.log('🗄️  Step 2: Creating Task Entity...');

    const taskEntity = await apiRequest('POST', '/entities', {
      name: 'task',
      displayName: 'Task',
      description: 'Task items with priority and status tracking',
      applicationId: appId,
      schema: {
        fields: [
          {
            name: 'title',
            type: 'string',
            required: true
          },
          {
            name: 'description',
            type: 'text',
            required: false
          },
          {
            name: 'status',
            type: 'string',
            required: true,
            defaultValue: 'pending'
          },
          {
            name: 'priority',
            type: 'string',
            required: false,
            defaultValue: 'medium'
          },
          {
            name: 'dueDate',
            type: 'date',
            required: false
          },
          {
            name: 'completed',
            type: 'boolean',
            required: false,
            defaultValue: false
          },
          {
            name: 'assignee',
            type: 'string',
            required: false
          }
        ]
      }
    });

    console.log(`✅ Task entity created (ID: ${taskEntity.id})\n`);

    // ==========================================
    // STEP 3: Create Task Entry Form
    // ==========================================
    console.log('📝 Step 3: Creating Task Entry Form...');

    const taskForm = await apiRequest('POST', '/forms', {
      applicationId: appId,
      name: 'task_entry_form',
      displayName: 'Task Entry Form',
      description: 'Form for creating and editing tasks',
      type: 'form',
      controls: [
        {
          type: 'text',
          name: 'title',
          props: {
            label: 'Task Title',
            required: true,
            placeholder: 'Enter task title'
          }
        },
        {
          type: 'textarea',
          name: 'description',
          props: {
            label: 'Description',
            rows: 4,
            placeholder: 'Describe the task'
          }
        },
        {
          type: 'select',
          name: 'priority',
          props: {
            label: 'Priority',
            options: [
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
              { value: 'urgent', label: 'Urgent' }
            ],
            defaultValue: 'medium'
          }
        },
        {
          type: 'select',
          name: 'status',
          props: {
            label: 'Status',
            options: [
              { value: 'pending', label: 'Pending' },
              { value: 'in-progress', label: 'In Progress' },
              { value: 'review', label: 'In Review' },
              { value: 'completed', label: 'Completed' }
            ],
            defaultValue: 'pending'
          }
        },
        {
          type: 'date',
          name: 'dueDate',
          props: {
            label: 'Due Date'
          }
        },
        {
          type: 'text',
          name: 'assignee',
          props: {
            label: 'Assignee',
            placeholder: 'Assign to'
          }
        },
        {
          type: 'checkbox',
          name: 'completed',
          props: {
            label: 'Mark as completed'
          }
        }
      ],
      settings: {
        submitButtonText: 'Save Task',
        showCancelButton: true
      }
    });

    console.log(`✅ Task Entry Form created (ID: ${taskForm.id})\n`);

    // ==========================================
    // STEP 4: Create Task List Grid
    // ==========================================
    console.log('📊 Step 4: Creating Task List Grid...');

    const taskGrid = await apiRequest('POST', '/grids', {
      applicationId: appId,
      name: 'task_list_grid',
      displayName: 'Task List',
      description: 'Grid view of all tasks with sorting and filtering',
      type: 'main',
      entityId: taskEntity.id,
      columns: [
        {
          field: 'title',
          header: 'Task',
          sortable: true,
          filterable: true,
          width: '30%'
        },
        {
          field: 'priority',
          header: 'Priority',
          sortable: true,
          filterable: true,
          width: '10%',
          template: '{{#if (eq priority "urgent")}}<span class="badge bg-danger">Urgent</span>{{else if (eq priority "high")}}<span class="badge bg-warning">High</span>{{else if (eq priority "medium")}}<span class="badge bg-info">Medium</span>{{else}}<span class="badge bg-secondary">Low</span>{{/if}}'
        },
        {
          field: 'status',
          header: 'Status',
          sortable: true,
          filterable: true,
          width: '15%',
          template: '{{#if (eq status "completed")}}<span class="badge bg-success">Completed</span>{{else if (eq status "in-progress")}}<span class="badge bg-primary">In Progress</span>{{else if (eq status "review")}}<span class="badge bg-warning">Review</span>{{else}}<span class="badge bg-secondary">Pending</span>{{/if}}'
        },
        {
          field: 'assignee',
          header: 'Assignee',
          sortable: true,
          filterable: true,
          width: '15%'
        },
        {
          field: 'dueDate',
          header: 'Due Date',
          sortable: true,
          width: '15%',
          template: '{{formatDate dueDate "MMM DD, YYYY"}}'
        },
        {
          field: 'actions',
          header: 'Actions',
          width: '15%',
          template: '<button class="btn btn-sm btn-primary" onclick="editTask(\'{{id}}\')">Edit</button> <button class="btn btn-sm btn-danger" onclick="deleteTask(\'{{id}}\')">Delete</button>'
        }
      ],
      settings: {
        pagination: true,
        pageSize: 25,
        showSearch: true,
        showFilters: true,
        exportable: true
      },
      sortOrders: [
        { field: 'dueDate', direction: 'asc' },
        { field: 'priority', direction: 'desc' }
      ]
    });

    console.log(`✅ Task List Grid created (ID: ${taskGrid.id})\n`);

    // ==========================================
    // STEP 5: Create Task Approval Process (BPMN)
    // ==========================================
    console.log('⚙️  Step 5: Creating Task Approval Process...');

    const taskProcess = await apiRequest('POST', '/processes/' + appId + '/processes', {
      name: 'task_approval_process',
      displayName: 'Task Approval Process',
      description: 'Automated workflow for high-priority task approval',
      category: 'task-management',
      definition: {
        startEvent: {
          id: 'start',
          type: 'start',
          name: 'Task Created'
        },
        tasks: [
          {
            id: 'check-priority',
            type: 'serviceTask',
            name: 'Check Priority',
            script: 'return task.priority === "urgent" || task.priority === "high";'
          },
          {
            id: 'notify-manager',
            type: 'serviceTask',
            name: 'Notify Manager',
            action: 'sendNotification',
            params: {
              recipient: 'manager@example.com',
              subject: 'High Priority Task Approval Required',
              template: 'task-approval'
            }
          },
          {
            id: 'manager-approval',
            type: 'userTask',
            name: 'Manager Approval',
            assignee: 'manager'
          },
          {
            id: 'auto-approve',
            type: 'serviceTask',
            name: 'Auto-Approve',
            script: 'task.status = "in-progress"; return task;'
          }
        ],
        gateways: [
          {
            id: 'is-high-priority',
            type: 'exclusive',
            name: 'High Priority?',
            condition: 'check-priority'
          }
        ],
        endEvent: {
          id: 'end',
          type: 'end',
          name: 'Task Processed'
        },
        flows: [
          { from: 'start', to: 'check-priority' },
          { from: 'check-priority', to: 'is-high-priority' },
          { from: 'is-high-priority', to: 'notify-manager', condition: 'true' },
          { from: 'is-high-priority', to: 'auto-approve', condition: 'false' },
          { from: 'notify-manager', to: 'manager-approval' },
          { from: 'manager-approval', to: 'end' },
          { from: 'auto-approve', to: 'end' }
        ]
      },
      inputs: [
        { name: 'task', type: 'object', required: true }
      ],
      outputs: [
        { name: 'approvedTask', type: 'object' }
      ]
    });

    console.log(`✅ Task Approval Process created (ID: ${taskProcess.id})\n`);

    // ==========================================
    // STEP 6: Create Task Analytics Charts
    // ==========================================
    console.log('📈 Step 6: Creating Analytics Charts...');

    // Chart 1: Task Status Distribution
    const statusChart = await apiRequest('POST', '/charts', {
      displayName: 'Task Status Distribution',
      description: 'Pie chart showing task distribution by status',
      applicationId: appId,
      config: {
        type: 'pie',
        dataSource: {
          type: 'entity',
          entityId: taskEntity.id,
          aggregation: {
            groupBy: 'status',
            aggregate: 'count'
          }
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'bottom'
            },
            title: {
              display: true,
              text: 'Tasks by Status'
            }
          }
        },
        colors: ['#6c757d', '#0d6efd', '#ffc107', '#198754']
      }
    });

    console.log(`✅ Status Chart created (ID: ${statusChart.id})`);

    // Chart 2: Task Priority Distribution
    const priorityChart = await apiRequest('POST', '/charts', {
      displayName: 'Task Priority Distribution',
      description: 'Doughnut chart showing task distribution by priority',
      applicationId: appId,
      config: {
        type: 'doughnut',
        dataSource: {
          type: 'entity',
          entityId: taskEntity.id,
          aggregation: {
            groupBy: 'priority',
            aggregate: 'count'
          }
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              position: 'bottom'
            },
            title: {
              display: true,
              text: 'Tasks by Priority'
            }
          }
        },
        colors: ['#6c757d', '#0dcaf0', '#ffc107', '#dc3545']
      }
    });

    console.log(`✅ Priority Chart created (ID: ${priorityChart.id})`);

    // Chart 3: Tasks Completion Trend
    const trendChart = await apiRequest('POST', '/charts', {
      displayName: 'Task Completion Trend',
      description: 'Line chart showing completed tasks over time',
      applicationId: appId,
      config: {
        type: 'line',
        dataSource: {
          type: 'entity',
          entityId: taskEntity.id,
          filters: [
            { field: 'completed', operator: 'eq', value: true }
          ],
          aggregation: {
            groupBy: 'created_at',
            aggregate: 'count',
            timeGroup: 'day'
          }
        },
        options: {
          responsive: true,
          plugins: {
            legend: {
              display: false
            },
            title: {
              display: true,
              text: 'Completed Tasks Over Time'
            }
          },
          scales: {
            y: {
              beginAtZero: true,
              ticks: {
                stepSize: 1
              }
            }
          }
        }
      }
    });

    console.log(`✅ Trend Chart created (ID: ${trendChart.id})\n`);

    // ==========================================
    // STEP 7: Create Executive Dashboard
    // ==========================================
    console.log('📊 Step 7: Creating Executive Dashboard...');

    const dashboard = await apiRequest('POST', '/dashboards', {
      displayName: 'Task Management Dashboard',
      description: 'Executive dashboard with task metrics and visualizations',
      applicationId: appId,
      config: {
        layout: [
          // Row 1: Metric Cards
          {
            x: 0,
            y: 0,
            w: 3,
            h: 2,
            type: 'metric',
            title: 'Total Tasks',
            config: {
              entityId: taskEntity.id,
              aggregation: 'count',
              icon: 'tasks',
              color: 'primary'
            }
          },
          {
            x: 3,
            y: 0,
            w: 3,
            h: 2,
            type: 'metric',
            title: 'Completed',
            config: {
              entityId: taskEntity.id,
              filters: [{ field: 'completed', operator: 'eq', value: true }],
              aggregation: 'count',
              icon: 'check-circle',
              color: 'success'
            }
          },
          {
            x: 6,
            y: 0,
            w: 3,
            h: 2,
            type: 'metric',
            title: 'In Progress',
            config: {
              entityId: taskEntity.id,
              filters: [{ field: 'status', operator: 'eq', value: 'in-progress' }],
              aggregation: 'count',
              icon: 'clock',
              color: 'warning'
            }
          },
          {
            x: 9,
            y: 0,
            w: 3,
            h: 2,
            type: 'metric',
            title: 'Overdue',
            config: {
              entityId: taskEntity.id,
              filters: [
                { field: 'dueDate', operator: 'lt', value: 'NOW()' },
                { field: 'completed', operator: 'eq', value: false }
              ],
              aggregation: 'count',
              icon: 'exclamation-triangle',
              color: 'danger'
            }
          },
          // Row 2: Charts
          {
            x: 0,
            y: 2,
            w: 4,
            h: 4,
            type: 'chart',
            title: 'Status Distribution',
            chartId: statusChart.id
          },
          {
            x: 4,
            y: 2,
            w: 4,
            h: 4,
            type: 'chart',
            title: 'Priority Distribution',
            chartId: priorityChart.id
          },
          {
            x: 8,
            y: 2,
            w: 4,
            h: 4,
            type: 'chart',
            title: 'Completion Trend',
            chartId: trendChart.id
          },
          // Row 3: Task List Grid
          {
            x: 0,
            y: 6,
            w: 12,
            h: 6,
            type: 'grid',
            title: 'Recent Tasks',
            gridId: taskGrid.id
          }
        ],
        theme: 'light',
        refreshInterval: 60000 // 1 minute
      }
    });

    console.log(`✅ Dashboard created (ID: ${dashboard.id})\n`);

    // ==========================================
    // SUCCESS!
    // ==========================================
    console.log('\n✨ Full-Featured Task Management Application Created Successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Summary:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Application: ${app.displayName}`);
    console.log(`Application ID: ${app.id}\n`);
    console.log(`✅ Entity: Task (ID: ${taskEntity.id})`);
    console.log(`✅ Form: Task Entry Form (ID: ${taskForm.id})`);
    console.log(`✅ Grid: Task List Grid (ID: ${taskGrid.id})`);
    console.log(`✅ Process: Task Approval (ID: ${taskProcess.id})`);
    console.log(`✅ Charts: 3 analytics charts created`);
    console.log(`✅ Dashboard: Executive Dashboard (ID: ${dashboard.id})`);
    console.log('\n🌐 Access Your Application:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`📱 Applications List: https://localhost:5001/lowcode/applications`);
    console.log(`🎨 App Designer: https://localhost:5001/lowcode/designer?appId=${appId}`);
    console.log(`📝 Task Entry Form: https://localhost:5001/lowcode/forms/${taskForm.id}/designer`);
    console.log(`📊 Task List Grid: https://localhost:5001/lowcode/grids/${taskGrid.id}/designer`);
    console.log(`⚙️  Approval Process: https://localhost:5001/lowcode/processes/${taskProcess.id}/designer`);
    console.log(`📈 Dashboard: https://localhost:5001/lowcode/dashboards/${dashboard.id}/designer`);
    console.log(`🚀 Run Application: https://localhost:5001/lowcode/apps/${appId}`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n❌ Error creating application:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
createFullExample();
