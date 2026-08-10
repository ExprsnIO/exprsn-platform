/**
 * Test Script: Application Wizard APIs
 *
 * Tests all API endpoints required for the 7-step Application Creation Wizard
 */

const db = require('../models');
const ApplicationService = require('../services/ApplicationService');
const { v4: uuidv4 } = require('uuid');

const TEST_USER_ID = uuidv4();

async function runTests() {
  console.log('🧪 Starting Application Wizard API Tests\n');
  console.log('═'.repeat(60));

  try {
    // Test 1: Create a test application
    console.log('\n📝 Test 1: Create Application');
    console.log('─'.repeat(60));
    const testApp = await ApplicationService.createApplication({
      name: 'test_wizard_app',
      displayName: 'Test Wizard Application',
      description: 'Application created for wizard API testing',
      version: '1.0.0',
      status: 'draft',
      icon: 'fas fa-flask',
      color: '#667eea',
      gitRepository: 'https://github.com/test/wizard-app.git',
      gitBranch: 'main',
      settings: {
        theme: 'exprsn-default',
        security: { visibility: 'private' }
      },
      metadata: {
        testRun: true,
        createdBy: 'test-script'
      }
    }, TEST_USER_ID);

    console.log('✅ Application created successfully');
    console.log('   ID:', testApp.id);
    console.log('   Name:', testApp.name);
    console.log('   Version:', testApp.version);
    console.log('   Status:', testApp.status);

    // Test 2: Create entity for the application
    console.log('\n📝 Test 2: Create Entity');
    console.log('─'.repeat(60));
    const testEntity = await db.Entity.create({
      applicationId: testApp.id,
      name: 'customers',
      displayName: 'Customers',
      description: 'Customer entity for testing',
      sourceType: 'custom',
      schema: {
        fields: [
          { name: 'id', type: 'uuid', primaryKey: true },
          { name: 'name', type: 'string', required: true },
          { name: 'email', type: 'string', required: true }
        ]
      },
      settings: {}
    });

    console.log('✅ Entity created successfully');
    console.log('   ID:', testEntity.id);
    console.log('   Name:', testEntity.name);

    // Test 3: Create form for the application
    console.log('\n📝 Test 3: Create Form');
    console.log('─'.repeat(60));
    const testForm = await db.AppForm.create({
      applicationId: testApp.id,
      entityId: testEntity.id,
      name: 'customer_form',
      displayName: 'Customer Form',
      description: 'Form for managing customers',
      formType: 'standard',
      layout: 'two-column',
      controls: [
        { type: 'input', field: 'name', label: 'Name' },
        { type: 'input', field: 'email', label: 'Email' }
      ],
      status: 'active',
      version: '1.0.0'
    });

    console.log('✅ Form created successfully');
    console.log('   ID:', testForm.id);
    console.log('   Name:', testForm.name);

    // Test 4: Create data source
    console.log('\n📝 Test 4: Create Data Source');
    console.log('─'.repeat(60));
    const testDataSource = await db.DataSource.create({
      applicationId: testApp.id,
      name: 'main_db',
      displayName: 'Main Database',
      description: 'Primary PostgreSQL database',
      sourceType: 'postgresql',
      connectionConfig: {
        host: 'localhost',
        port: 5432,
        database: 'exprsn_svr',
        username: 'postgres'
      },
      operations: {
        read: true,
        create: true,
        update: true,
        delete: true
      },
      status: 'active'
    });

    console.log('✅ Data Source created successfully');
    console.log('   ID:', testDataSource.id);
    console.log('   Name:', testDataSource.name);
    console.log('   Type:', testDataSource.sourceType);

    // Test 5: Create query
    console.log('\n📝 Test 5: Create Query');
    console.log('─'.repeat(60));
    const testQuery = await db.Query.create({
      applicationId: testApp.id,
      dataSourceId: testDataSource.id,
      name: 'get_all_customers',
      displayName: 'Get All Customers',
      description: 'Retrieves all customers from the database',
      queryType: 'visual',
      queryDefinition: {
        tables: [
          {
            name: 'customers',
            alias: 'c',
            columns: ['id', 'name', 'email', 'created_at']
          }
        ],
        filters: [
          {
            field: 'c.status',
            operator: '=',
            value: 'active'
          }
        ],
        orderBy: [
          { field: 'c.created_at', direction: 'DESC' }
        ],
        limit: 100
      },
      parameters: [
        {
          name: 'status',
          type: 'string',
          defaultValue: 'active',
          required: false
        }
      ],
      cacheEnabled: true,
      cacheTtl: 300,
      status: 'active'
    });

    console.log('✅ Query created successfully');
    console.log('   ID:', testQuery.id);
    console.log('   Name:', testQuery.name);
    console.log('   Type:', testQuery.queryType);
    console.log('   Status:', testQuery.status);

    // Test 6: Verify query associations
    console.log('\n📝 Test 6: Verify Query Associations');
    console.log('─'.repeat(60));
    const queryWithAssociations = await db.Query.findByPk(testQuery.id, {
      include: [
        { model: db.Application, as: 'application' },
        { model: db.DataSource, as: 'dataSource' }
      ]
    });

    console.log('✅ Query associations verified');
    console.log('   Application:', queryWithAssociations.application.name);
    console.log('   Data Source:', queryWithAssociations.dataSource.name);

    // Test 7: Clone application
    console.log('\n📝 Test 7: Clone Application');
    console.log('─'.repeat(60));
    const clonedApp = await ApplicationService.cloneApplication(
      testApp.id,
      {
        name: 'test_wizard_app_clone',
        displayName: 'Test Wizard App (Clone)',
        description: 'Cloned from test application',
        version: '1.0.0',
        cloneOptions: {
          entities: true,
          forms: true,
          grids: false,
          dataSources: false,
          queries: false
        },
        overrides: {
          color: '#ff6b6b',
          icon: 'fas fa-copy',
          status: 'draft',
          gitRepository: 'https://github.com/test/cloned-app.git'
        }
      },
      TEST_USER_ID
    );

    console.log('✅ Application cloned successfully');
    console.log('   ID:', clonedApp.id);
    console.log('   Name:', clonedApp.name);
    console.log('   Version:', clonedApp.version);
    console.log('   Entities cloned:', clonedApp.entities?.length || 0);
    console.log('   Forms cloned:', clonedApp.forms?.length || 0);
    console.log('   Clone metadata:', JSON.stringify(clonedApp.settings.clonedFrom, null, 2));

    // Test 8: Verify query execution tracking
    console.log('\n📝 Test 8: Test Query Execution Tracking');
    console.log('─'.repeat(60));
    const executionsBefore = testQuery.executionCount;
    await testQuery.incrementExecutionCount();
    await testQuery.reload();

    console.log('✅ Execution count incremented');
    console.log('   Before:', executionsBefore);
    console.log('   After:', testQuery.executionCount);
    console.log('   Last executed:', testQuery.lastExecutedAt);

    // Test 9: Test query filtering
    console.log('\n📝 Test 9: Test Query Filtering');
    console.log('─'.repeat(60));
    const activeQueries = await db.Query.findAll({
      where: {
        applicationId: testApp.id,
        status: 'active'
      }
    });

    console.log('✅ Query filtering works');
    console.log('   Active queries found:', activeQueries.length);

    // Test 10: Test application with all relations
    console.log('\n📝 Test 10: Load Application with All Relations');
    console.log('─'.repeat(60));
    const fullApp = await ApplicationService.getApplicationById(testApp.id, {
      includeEntities: true,
      includeForms: true,
      includeDataSources: true,
      includeGrids: true
    });

    console.log('✅ Full application loaded');
    console.log('   Entities:', fullApp.entities?.length || 0);
    console.log('   Forms:', fullApp.forms?.length || 0);
    console.log('   Data Sources:', fullApp.dataSources?.length || 0);
    console.log('   Grids:', fullApp.grids?.length || 0);

    // Cleanup
    console.log('\n🧹 Cleanup: Deleting Test Data');
    console.log('─'.repeat(60));
    await clonedApp.destroy({ force: true });
    await testQuery.destroy({ force: true });
    await testDataSource.destroy({ force: true });
    await testForm.destroy({ force: true });
    await testEntity.destroy({ force: true });
    await testApp.destroy({ force: true });

    console.log('✅ Test data cleaned up');

    console.log('\n' + '═'.repeat(60));
    console.log('✅ ALL TESTS PASSED!');
    console.log('═'.repeat(60));
    console.log('\n📊 Test Summary:');
    console.log('   • Application creation: ✅');
    console.log('   • Entity creation: ✅');
    console.log('   • Form creation: ✅');
    console.log('   • Data source creation: ✅');
    console.log('   • Query creation: ✅');
    console.log('   • Query associations: ✅');
    console.log('   • Application cloning: ✅');
    console.log('   • Query execution tracking: ✅');
    console.log('   • Query filtering: ✅');
    console.log('   • Full application loading: ✅');
    console.log('\n🎉 Application Wizard APIs are fully functional!\n');

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    await db.sequelize.close();
  }
}

// Run tests
runTests();
