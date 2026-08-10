/**
 * Create Simple Example Application
 * Demonstrates Low-Code Platform with a minimal working example
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
            console.error(`API Error: ${response.message}`);
            console.error('Response:', JSON.stringify(response, null, 2));
            reject(new Error(response.message || 'Request failed'));
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

async function createSimpleExample() {
  console.log('🚀 Creating Simple Example Application...\n');

  try {
    // ==========================================
    // STEP 1: Create Application
    // ==========================================
    console.log('📦 Step 1: Creating Application...');

    const timestamp = Date.now();
    const app = await apiRequest('POST', '/applications', {
      name: `task-manager-${timestamp}`,
      displayName: 'Task Manager',
      description: 'Simple task management application demonstrating Low-Code Platform features'
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
      description: 'Task items',
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
          }
        ]
      }
    });

    console.log(`✅ Task entity created (ID: ${taskEntity.id})\n`);

    // ==========================================
    // SUCCESS!
    // ==========================================
    console.log('✨ Example application created successfully!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 Summary:');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`Application: ${app.displayName}`);
    console.log(`Application ID: ${app.id}`);
    console.log(`\nEntity: Task (ID: ${taskEntity.id})`);
    console.log('\n🌐 Next Steps:');
    console.log(`1. View application: https://localhost:5001/lowcode/applications`);
    console.log(`2. Open designer: https://localhost:5001/lowcode/designer?appId=${appId}`);
    console.log(`3. Create a form for the Task entity`);
    console.log(`4. Create a grid to display tasks`);
    console.log(`5. Add charts and dashboards`);
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('❌ Error creating application:', error.message);
    console.error(error);
    process.exit(1);
  }
}

// Run the script
createSimpleExample();
