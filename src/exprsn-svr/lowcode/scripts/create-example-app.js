/**
 * Create Full-Featured Example Application
 * Demonstrates all Low-Code Platform capabilities
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
            reject(new Error(response.message || 'Request failed'));
          }
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }

    req.end();
  });
}

async function createExampleApplication() {
  console.log('🚀 Creating Full-Featured Customer Management System...\n');

  try {
    // ==========================================
    // STEP 1: Create Application
    // ==========================================
    console.log('📦 Step 1: Creating Application...');

    const app = await apiRequest('POST', '/applications', {
      name: 'customer-management-system',
      displayName: 'Customer Management System',
      description: 'Full-featured CMS showcasing all Low-Code Platform capabilities including entities, forms, grids, BPMN processes, charts, and dashboards'
    });

    console.log(`✅ Application created: ${app.displayName} (ID: ${app.id})\n`);
    const appId = app.id;

    // ==========================================
    // STEP 2: Create Entities
    // ==========================================
    console.log('🗄️  Step 2: Creating Entities...');

    // Customer Entity
    const customerEntity = await apiRequest('POST', '/entities', {
      name: 'customer',
      displayName: 'Customer',
      description: 'Customer information',
      applicationId: appId,
      tableName: 'cms_customers',
      status: 'published',
      fields: [
        {
          name: 'firstName',
          displayName: 'First Name',
          dataType: 'string',
          required: true,
          maxLength: 100
        },
        {
          name: 'lastName',
          displayName: 'Last Name',
          dataType: 'string',
          required: true,
          maxLength: 100
        },
        {
          name: 'email',
          displayName: 'Email',
          dataType: 'string',
          required: true,
          isUnique: true,
          maxLength: 255
        },
        {
          name: 'phone',
          displayName: 'Phone',
          dataType: 'string',
          required: false,
          maxLength: 20
        },
        {
          name: 'company',
          displayName: 'Company',
          dataType: 'string',
          required: false,
          maxLength: 200
        },
        {
          name: 'status',
          displayName: 'Status',
          dataType: 'string',
          required: true,
          defaultValue: 'active'
        },
        {
          name: 'totalOrders',
          displayName: 'Total Orders',
          dataType: 'integer',
          required: false,
          defaultValue: 0
        },
        {
          name: 'lifetimeValue',
          displayName: 'Lifetime Value',
          dataType: 'decimal',
          required: false,
          defaultValue: 0
        }
      ]
    });

    console.log(`✅ Customer entity created (ID: ${customerEntity.id})`);

    // Product Entity
    const productEntity = await apiRequest('POST', '/entities', {
      name: 'product',
      displayName: 'Product',
      description: 'Product catalog',
      applicationId: appId,
      tableName: 'cms_products',
      status: 'published',
      fields: [
        {
          name: 'name',
          displayName: 'Product Name',
          dataType: 'string',
          required: true,
          maxLength: 200
        },
        {
          name: 'sku',
          displayName: 'SKU',
          dataType: 'string',
          required: true,
          isUnique: true,
          maxLength: 50
        },
        {
          name: 'description',
          displayName: 'Description',
          dataType: 'text',
          required: false
        },
        {
          name: 'price',
          displayName: 'Price',
          dataType: 'decimal',
          required: true
        },
        {
          name: 'category',
          displayName: 'Category',
          dataType: 'string',
          required: true,
          maxLength: 100
        },
        {
          name: 'inStock',
          displayName: 'In Stock',
          dataType: 'boolean',
          required: true,
          defaultValue: true
        },
        {
          name: 'quantity',
          displayName: 'Quantity',
          dataType: 'integer',
          required: true,
          defaultValue: 0
        }
      ]
    });

    console.log(`✅ Product entity created (ID: ${productEntity.id})`);

    // Order Entity
    const orderEntity = await apiRequest('POST', '/entities', {
      name: 'order',
      displayName: 'Order',
      description: 'Customer orders',
      applicationId: appId,
      tableName: 'cms_orders',
      status: 'published',
      fields: [
        {
          name: 'orderNumber',
          displayName: 'Order Number',
          dataType: 'string',
          required: true,
          isUnique: true,
          maxLength: 50
        },
        {
          name: 'customerId',
          displayName: 'Customer ID',
          dataType: 'uuid',
          required: true
        },
        {
          name: 'customerName',
          displayName: 'Customer Name',
          dataType: 'string',
          required: true,
          maxLength: 200
        },
        {
          name: 'orderDate',
          displayName: 'Order Date',
          dataType: 'date',
          required: true
        },
        {
          name: 'totalAmount',
          displayName: 'Total Amount',
          dataType: 'decimal',
          required: true
        },
        {
          name: 'status',
          displayName: 'Status',
          dataType: 'string',
          required: true,
          defaultValue: 'pending'
        },
        {
          name: 'approvedBy',
          displayName: 'Approved By',
          dataType: 'string',
          required: false,
          maxLength: 200
        },
        {
          name: 'notes',
          displayName: 'Notes',
          dataType: 'text',
          required: false
        }
      ]
    });

    console.log(`✅ Order entity created (ID: ${orderEntity.id})\n`);

    // ==========================================
    // STEP 3: Create Forms
    // ==========================================
    console.log('📝 Step 3: Creating Forms...');

    // Customer Registration Form
    const customerForm = await apiRequest('POST', '/forms', {
      name: 'customer-registration',
      displayName: 'Customer Registration Form',
      description: 'New customer registration with validation',
      applicationId: appId,
      status: 'published',
      config: {
        components: [
          {
            id: 'comp-1',
            type: 'heading',
            properties: {
              text: 'Customer Registration',
              level: 'h2'
            }
          },
          {
            id: 'comp-2',
            type: 'container',
            properties: {
              columns: 2
            },
            children: [
              {
                id: 'comp-3',
                type: 'text',
                properties: {
                  label: 'First Name',
                  name: 'firstName',
                  required: true,
                  placeholder: 'Enter first name'
                }
              },
              {
                id: 'comp-4',
                type: 'text',
                properties: {
                  label: 'Last Name',
                  name: 'lastName',
                  required: true,
                  placeholder: 'Enter last name'
                }
              }
            ]
          },
          {
            id: 'comp-5',
            type: 'email',
            properties: {
              label: 'Email Address',
              name: 'email',
              required: true,
              placeholder: 'customer@example.com'
            }
          },
          {
            id: 'comp-6',
            type: 'text',
            properties: {
              label: 'Phone Number',
              name: 'phone',
              placeholder: '(555) 123-4567'
            }
          },
          {
            id: 'comp-7',
            type: 'text',
            properties: {
              label: 'Company',
              name: 'company',
              placeholder: 'Company name (optional)'
            }
          },
          {
            id: 'comp-8',
            type: 'dropdown',
            properties: {
              label: 'Status',
              name: 'status',
              required: true,
              options: [
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'prospect', label: 'Prospect' }
              ],
              defaultValue: 'active'
            }
          },
          {
            id: 'comp-9',
            type: 'button',
            properties: {
              text: 'Register Customer',
              variant: 'primary',
              type: 'submit'
            }
          }
        ],
        layout: {
          type: 'vertical',
          spacing: 'medium'
        },
        dataBinding: {
          type: 'entity',
          config: {
            entityId: customerEntity.id,
            entityName: 'customer'
          },
          mode: 'two-way'
        },
        eventHandlers: [
          {
            trigger: 'onSubmit',
            type: 'data-operation',
            config: {
              operation: 'save',
              successMessage: 'Customer registered successfully!',
              redirectTo: '/lowcode/apps/' + appId
            }
          }
        ],
        permissions: {
          formLevel: {
            view: 'all',
            edit: 'all',
            submit: 'all'
          }
        }
      }
    });

    console.log(`✅ Customer Registration form created (ID: ${customerForm.id})`);

    // Order Entry Form
    const orderForm = await apiRequest('POST', '/forms', {
      name: 'order-entry',
      displayName: 'Order Entry Form',
      description: 'Create new customer order',
      applicationId: appId,
      status: 'published',
      config: {
        components: [
          {
            id: 'ord-1',
            type: 'heading',
            properties: {
              text: 'New Order',
              level: 'h2'
            }
          },
          {
            id: 'ord-2',
            type: 'text',
            properties: {
              label: 'Order Number',
              name: 'orderNumber',
              required: true,
              placeholder: 'Auto-generated'
            }
          },
          {
            id: 'ord-3',
            type: 'entity-picker',
            properties: {
              label: 'Customer',
              name: 'customerId',
              entityId: customerEntity.id,
              displayField: 'email',
              required: true
            }
          },
          {
            id: 'ord-4',
            type: 'date',
            properties: {
              label: 'Order Date',
              name: 'orderDate',
              required: true
            }
          },
          {
            id: 'ord-5',
            type: 'number',
            properties: {
              label: 'Total Amount',
              name: 'totalAmount',
              required: true,
              min: 0,
              step: 0.01,
              prefix: '$'
            }
          },
          {
            id: 'ord-6',
            type: 'dropdown',
            properties: {
              label: 'Status',
              name: 'status',
              required: true,
              options: [
                { value: 'pending', label: 'Pending Approval' },
                { value: 'approved', label: 'Approved' },
                { value: 'shipped', label: 'Shipped' },
                { value: 'delivered', label: 'Delivered' },
                { value: 'cancelled', label: 'Cancelled' }
              ],
              defaultValue: 'pending'
            }
          },
          {
            id: 'ord-7',
            type: 'textarea',
            properties: {
              label: 'Notes',
              name: 'notes',
              rows: 4,
              placeholder: 'Additional order notes...'
            }
          },
          {
            id: 'ord-8',
            type: 'button',
            properties: {
              text: 'Submit Order',
              variant: 'primary',
              type: 'submit'
            }
          }
        ],
        dataBinding: {
          type: 'entity',
          config: {
            entityId: orderEntity.id,
            entityName: 'order'
          },
          mode: 'two-way'
        },
        eventHandlers: [
          {
            trigger: 'onSubmit',
            type: 'workflow',
            config: {
              workflowId: null, // Will be set after creating process
              inputMapping: {
                orderId: 'id',
                amount: 'totalAmount'
              },
              successMessage: 'Order submitted for approval!'
            }
          }
        ]
      }
    });

    console.log(`✅ Order Entry form created (ID: ${orderForm.id})\n`);

    // ==========================================
    // STEP 4: Create Grids
    // ==========================================
    console.log('📊 Step 4: Creating Grids...');

    // Customer Grid
    const customerGrid = await apiRequest('POST', '/grids', {
      displayName: 'Customer List',
      description: 'All customers with status and metrics',
      applicationId: appId,
      entityId: customerEntity.id,
      status: 'published',
      config: {
        columns: [
          {
            name: 'firstName',
            displayName: 'First Name',
            dataType: 'string',
            sortable: true,
            filterable: true,
            width: 150
          },
          {
            name: 'lastName',
            displayName: 'Last Name',
            dataType: 'string',
            sortable: true,
            filterable: true,
            width: 150
          },
          {
            name: 'email',
            displayName: 'Email',
            dataType: 'string',
            sortable: true,
            filterable: true,
            width: 250
          },
          {
            name: 'company',
            displayName: 'Company',
            dataType: 'string',
            sortable: true,
            filterable: true,
            width: 200
          },
          {
            name: 'status',
            displayName: 'Status',
            dataType: 'string',
            sortable: true,
            filterable: true,
            width: 120,
            template: '<span class="badge badge-{{value}}">{{value}}</span>'
          },
          {
            name: 'totalOrders',
            displayName: 'Total Orders',
            dataType: 'number',
            sortable: true,
            width: 120,
            align: 'right'
          },
          {
            name: 'lifetimeValue',
            displayName: 'Lifetime Value',
            dataType: 'currency',
            sortable: true,
            width: 150,
            align: 'right',
            template: '{{formatCurrency value}}'
          }
        ],
        defaultSort: {
          column: 'lastName',
          direction: 'asc'
        },
        defaultPageSize: 25,
        enableExport: true,
        enableSearch: true,
        actions: [
          {
            name: 'edit',
            label: 'Edit',
            icon: 'edit',
            type: 'row'
          },
          {
            name: 'delete',
            label: 'Delete',
            icon: 'trash',
            type: 'row',
            confirmMessage: 'Are you sure you want to delete this customer?'
          }
        ]
      }
    });

    console.log(`✅ Customer grid created (ID: ${customerGrid.id})`);

    // Order Grid
    const orderGrid = await apiRequest('POST', '/grids', {
      displayName: 'Order List',
      description: 'All orders with status tracking',
      applicationId: appId,
      entityId: orderEntity.id,
      status: 'published',
      config: {
        columns: [
          {
            name: 'orderNumber',
            displayName: 'Order #',
            dataType: 'string',
            sortable: true,
            filterable: true,
            width: 150
          },
          {
            name: 'customerName',
            displayName: 'Customer',
            dataType: 'string',
            sortable: true,
            filterable: true,
            width: 200
          },
          {
            name: 'orderDate',
            displayName: 'Order Date',
            dataType: 'date',
            sortable: true,
            filterable: true,
            width: 150,
            template: '{{formatDate value "MM/DD/YYYY"}}'
          },
          {
            name: 'totalAmount',
            displayName: 'Total',
            dataType: 'currency',
            sortable: true,
            width: 120,
            align: 'right',
            template: '{{formatCurrency value}}'
          },
          {
            name: 'status',
            displayName: 'Status',
            dataType: 'string',
            sortable: true,
            filterable: true,
            width: 150,
            template: '<span class="badge badge-{{value}}">{{value}}</span>'
          },
          {
            name: 'approvedBy',
            displayName: 'Approved By',
            dataType: 'string',
            sortable: true,
            width: 180
          }
        ],
        defaultSort: {
          column: 'orderDate',
          direction: 'desc'
        },
        defaultPageSize: 25,
        enableExport: true,
        enableSearch: true
      }
    });

    console.log(`✅ Order grid created (ID: ${orderGrid.id})\n`);

    // ==========================================
    // STEP 5: Create Process (BPMN)
    // ==========================================
    console.log('⚙️  Step 5: Creating BPMN Process...');

    const orderProcess = await apiRequest('POST', '/processes', {
      displayName: 'Order Approval Workflow',
      description: 'Automated order approval process with conditional routing',
      applicationId: appId,
      status: 'published',
      config: {
        elements: [
          {
            id: 'start-1',
            type: 'start-event',
            name: 'Order Submitted',
            x: 100,
            y: 200,
            properties: {}
          },
          {
            id: 'task-1',
            type: 'service-task',
            name: 'Validate Order',
            x: 250,
            y: 200,
            properties: {
              serviceType: 'http',
              url: '/lowcode/api/entities/' + orderEntity.id + '/data',
              method: 'GET'
            }
          },
          {
            id: 'gateway-1',
            type: 'exclusive-gateway',
            name: 'Amount > $1000?',
            x: 450,
            y: 200,
            properties: {}
          },
          {
            id: 'task-2',
            type: 'user-task',
            name: 'Manager Approval',
            x: 600,
            y: 100,
            properties: {
              assignee: 'manager@example.com',
              dueDate: null,
              formKey: 'approval-form'
            }
          },
          {
            id: 'task-3',
            type: 'service-task',
            name: 'Auto-Approve',
            x: 600,
            y: 300,
            properties: {
              serviceType: 'script',
              script: 'return { approved: true, approvedBy: "system" };'
            }
          },
          {
            id: 'task-4',
            type: 'service-task',
            name: 'Update Order Status',
            x: 800,
            y: 200,
            properties: {
              serviceType: 'http',
              url: '/lowcode/api/entities/' + orderEntity.id + '/data',
              method: 'PUT'
            }
          },
          {
            id: 'end-1',
            type: 'end-event',
            name: 'Order Processed',
            x: 950,
            y: 200,
            properties: {}
          }
        ],
        connections: [
          {
            id: 'conn-1',
            sourceId: 'start-1',
            targetId: 'task-1',
            label: ''
          },
          {
            id: 'conn-2',
            sourceId: 'task-1',
            targetId: 'gateway-1',
            label: ''
          },
          {
            id: 'conn-3',
            sourceId: 'gateway-1',
            targetId: 'task-2',
            label: 'Yes',
            condition: '${amount > 1000}'
          },
          {
            id: 'conn-4',
            sourceId: 'gateway-1',
            targetId: 'task-3',
            label: 'No',
            isDefault: true
          },
          {
            id: 'conn-5',
            sourceId: 'task-2',
            targetId: 'task-4',
            label: ''
          },
          {
            id: 'conn-6',
            sourceId: 'task-3',
            targetId: 'task-4',
            label: ''
          },
          {
            id: 'conn-7',
            sourceId: 'task-4',
            targetId: 'end-1',
            label: ''
          }
        ],
        variables: {
          orderId: null,
          amount: 0,
          approved: false,
          approvedBy: null
        }
      }
    });

    console.log(`✅ Order Approval process created (ID: ${orderProcess.id})\n`);

    // ==========================================
    // STEP 6: Create Charts
    // ==========================================
    console.log('📈 Step 6: Creating Charts...');

    // Sales by Month Chart
    const salesChart = await apiRequest('POST', '/charts', {
      displayName: 'Sales by Month',
      description: 'Monthly sales trend analysis',
      applicationId: appId,
      status: 'published',
      config: {
        type: 'line',
        xAxisLabel: 'Month',
        yAxisLabel: 'Sales ($)',
        colorScheme: 'default',
        showLegend: true,
        legendPosition: 'top',
        showGrid: true,
        enableAnimation: true,
        animationDuration: 1000,
        dataSource: {
          type: 'static',
          config: {
            data: [
              { label: 'Jan', value: 45000 },
              { label: 'Feb', value: 52000 },
              { label: 'Mar', value: 48000 },
              { label: 'Apr', value: 61000 },
              { label: 'May', value: 58000 },
              { label: 'Jun', value: 67000 }
            ]
          }
        }
      }
    });

    console.log(`✅ Sales chart created (ID: ${salesChart.id})`);

    // Customer Growth Chart
    const growthChart = await apiRequest('POST', '/charts', {
      displayName: 'Customer Growth',
      description: 'New customers per month',
      applicationId: appId,
      status: 'published',
      config: {
        type: 'bar',
        xAxisLabel: 'Month',
        yAxisLabel: 'New Customers',
        colorScheme: 'rainbow',
        showLegend: true,
        legendPosition: 'top',
        showGrid: true,
        enableAnimation: true,
        dataSource: {
          type: 'static',
          config: {
            data: [
              { label: 'Jan', value: 23 },
              { label: 'Feb', value: 31 },
              { label: 'Mar', value: 28 },
              { label: 'Apr', value: 42 },
              { label: 'May', value: 38 },
              { label: 'Jun', value: 45 }
            ]
          }
        }
      }
    });

    console.log(`✅ Customer Growth chart created (ID: ${growthChart.id})`);

    // Revenue by Category Chart
    const categoryChart = await apiRequest('POST', '/charts', {
      displayName: 'Revenue by Category',
      description: 'Revenue distribution across product categories',
      applicationId: appId,
      status: 'published',
      config: {
        type: 'doughnut',
        colorScheme: 'pastel',
        showLegend: true,
        legendPosition: 'right',
        enableAnimation: true,
        dataSource: {
          type: 'static',
          config: {
            data: [
              { label: 'Electronics', value: 125000 },
              { label: 'Clothing', value: 85000 },
              { label: 'Home & Garden', value: 67000 },
              { label: 'Sports', value: 54000 },
              { label: 'Books', value: 38000 }
            ]
          }
        }
      }
    });

    console.log(`✅ Revenue by Category chart created (ID: ${categoryChart.id})\n`);

    // ==========================================
    // STEP 7: Create Dashboard
    // ==========================================
    console.log('📊 Step 7: Creating Executive Dashboard...');

    const dashboard = await apiRequest('POST', '/dashboards', {
      displayName: 'Executive Dashboard',
      description: 'Real-time business metrics and KPIs',
      applicationId: appId,
      status: 'published',
      config: {
        refreshInterval: 30,
        widgets: [
          // Metric Cards Row
          {
            id: 'metric-1',
            type: 'metric',
            title: 'Total Revenue',
            x: 0,
            y: 0,
            w: 3,
            h: 2,
            config: {
              value: '$331,000',
              label: 'Total Revenue',
              change: 12.5
            }
          },
          {
            id: 'metric-2',
            type: 'metric',
            title: 'Active Customers',
            x: 3,
            y: 0,
            w: 3,
            h: 2,
            config: {
              value: '207',
              label: 'Active Customers',
              change: 8.3
            }
          },
          {
            id: 'metric-3',
            type: 'metric',
            title: 'Pending Orders',
            x: 6,
            y: 0,
            w: 3,
            h: 2,
            config: {
              value: '15',
              label: 'Pending Approval',
              change: -5.2
            }
          },
          {
            id: 'metric-4',
            type: 'metric',
            title: 'Avg Order Value',
            x: 9,
            y: 0,
            w: 3,
            h: 2,
            config: {
              value: '$1,598',
              label: 'Average Order',
              change: 3.7
            }
          },
          // Charts Row
          {
            id: 'chart-1',
            type: 'chart',
            title: 'Sales by Month',
            x: 0,
            y: 2,
            w: 6,
            h: 4,
            config: {
              chartType: 'line',
              dataSource: 'static'
            }
          },
          {
            id: 'chart-2',
            type: 'chart',
            title: 'Customer Growth',
            x: 6,
            y: 2,
            w: 6,
            h: 4,
            config: {
              chartType: 'bar',
              dataSource: 'static'
            }
          },
          // Bottom Row
          {
            id: 'chart-3',
            type: 'chart',
            title: 'Revenue by Category',
            x: 0,
            y: 6,
            w: 4,
            h: 4,
            config: {
              chartType: 'doughnut',
              dataSource: 'static'
            }
          },
          {
            id: 'process-stats-1',
            type: 'process-stats',
            title: 'Order Approval Status',
            x: 4,
            y: 6,
            w: 4,
            h: 4,
            config: {
              processId: orderProcess.id
            }
          },
          {
            id: 'task-list-1',
            type: 'task-list',
            title: 'My Tasks',
            x: 8,
            y: 6,
            w: 4,
            h: 4,
            config: {
              filter: 'mine'
            }
          }
        ]
      }
    });

    console.log(`✅ Executive Dashboard created (ID: ${dashboard.id})\n`);

    // ==========================================
    // SUMMARY
    // ==========================================
    console.log('═══════════════════════════════════════════════════════');
    console.log('✨ CUSTOMER MANAGEMENT SYSTEM - COMPLETE! ✨');
    console.log('═══════════════════════════════════════════════════════\n');

    console.log('📦 Application Details:');
    console.log(`   Name: ${app.displayName}`);
    console.log(`   ID: ${appId}`);
    console.log(`   Status: ${app.status}\n`);

    console.log('🗄️  Entities Created (3):');
    console.log(`   • Customer (${customerEntity.id})`);
    console.log(`   • Product (${productEntity.id})`);
    console.log(`   • Order (${orderEntity.id})\n`);

    console.log('📝 Forms Created (2):');
    console.log(`   • Customer Registration (${customerForm.id})`);
    console.log(`   • Order Entry (${orderForm.id})\n`);

    console.log('📊 Grids Created (2):');
    console.log(`   • Customer List (${customerGrid.id})`);
    console.log(`   • Order List (${orderGrid.id})\n`);

    console.log('⚙️  Processes Created (1):');
    console.log(`   • Order Approval Workflow (${orderProcess.id})`);
    console.log(`     - BPMN 2.0 compliant`);
    console.log(`     - 7 elements, 7 connections`);
    console.log(`     - Conditional routing based on order amount\n`);

    console.log('📈 Charts Created (3):');
    console.log(`   • Sales by Month (${salesChart.id})`);
    console.log(`   • Customer Growth (${growthChart.id})`);
    console.log(`   • Revenue by Category (${categoryChart.id})\n`);

    console.log('📊 Dashboards Created (1):');
    console.log(`   • Executive Dashboard (${dashboard.id})`);
    console.log(`     - 10 widgets`);
    console.log(`     - 4 metric cards, 3 charts, 3 widgets\n`);

    console.log('🌐 Access URLs:');
    console.log(`   Application Designer:`);
    console.log(`   https://localhost:5001/lowcode/designer?appId=${appId}\n`);
    console.log(`   Customer Registration Form:`);
    console.log(`   https://localhost:5001/lowcode/apps/${appId}/forms/${customerForm.id}\n`);
    console.log(`   Order Entry Form:`);
    console.log(`   https://localhost:5001/lowcode/apps/${appId}/forms/${orderForm.id}\n`);
    console.log(`   Process Monitor:`);
    console.log(`   https://localhost:5001/lowcode/processes/${orderProcess.id}/monitor\n`);
    console.log(`   Task Inbox:`);
    console.log(`   https://localhost:5001/lowcode/tasks/inbox\n`);
    console.log(`   Executive Dashboard:`);
    console.log(`   https://localhost:5001/lowcode/dashboards/${dashboard.id}/designer\n`);

    console.log('═══════════════════════════════════════════════════════');
    console.log('🎉 Ready to test! Open the URLs above in your browser.');
    console.log('═══════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error creating application:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the script
createExampleApplication();
