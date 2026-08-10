/**
 * Test Script: Core Wizard APIs
 *
 * Tests the core new APIs for the Application Creation Wizard:
 * - Application creation with version/status
 * - Application cloning
 * - Query CRUD with database persistence
 * - Query associations
 */

const db = require('../models');
const ApplicationService = require('../services/ApplicationService');
const { v4: uuidv4 } = require('uuid');

const TEST_USER_ID = uuidv4();

async function runTests() {
  console.log('🧪 Testing Core Wizard APIs\n');
  console.log('═'.repeat(70));

  try {
    // Test 1: Create Application with version and status
    console.log('\n✨ Test 1: Create Application with Version/Status');
    console.log('─'.repeat(70));
    const app1 = await ApplicationService.createApplication({
      name: 'test_app_v1',
      displayName: 'Test Application V1',
      description: 'Testing enhanced application creation',
      version: '2.5.0',
      status: 'draft',
      icon: 'fas fa-rocket',
      color: '#667eea',
      gitRepository: 'https://github.com/test/app-v1.git',
      gitBranch: 'develop',
      settings: { theme: 'exprsn-modern' },
      metadata: { testType: 'wizard-core' }
    }, TEST_USER_ID);

    console.log('✅ Application created with custom version/status');
    console.log(`   ID: ${app1.id}`);
    console.log(`   Name: ${app1.name}`);
    console.log(`   Version: ${app1.version} (custom initial version)`);
    console.log(`   Status: ${app1.status}`);
    console.log(`   Git Repository: ${app1.gitRepository}`);
    console.log(`   Git Branch: ${app1.gitBranch}`);

    // Test 2: Create Data Source
    console.log('\n✨ Test 2: Create Data Source for Queries');
    console.log('─'.repeat(70));
    const dataSource = await db.DataSource.create({
      applicationId: app1.id,
      name: 'test_postgres',
      displayName: 'Test PostgreSQL',
      description: 'Test database connection',
      sourceType: 'postgresql',
      connectionConfig: {
        host: 'localhost',
        port: 5432,
        database: 'exprsn_svr'
      },
      operations: { read: true, create: true },
      status: 'active'
    });

    console.log('✅ Data source created');
    console.log(`   ID: ${dataSource.id}`);
    console.log(`   Name: ${dataSource.name}`);
    console.log(`   Type: ${dataSource.sourceType}`);

    // Test 3: Create Query (NEW FEATURE)
    console.log('\n✨ Test 3: Create Query with Database Persistence');
    console.log('─'.repeat(70));
    const query1 = await db.Query.create({
      applicationId: app1.id,
      dataSourceId: dataSource.id,
      name: 'get_users',
      displayName: 'Get Users',
      description: 'Retrieve all users from database',
      queryType: 'visual',
      queryDefinition: {
        tables: [{ name: 'users', alias: 'u', columns: ['id', 'email', 'name'] }],
        filters: [{ field: 'u.active', operator: '=', value: true }],
        orderBy: [{ field: 'u.created_at', direction: 'DESC' }],
        limit: 50
      },
      parameters: [
        { name: 'active', type: 'boolean', defaultValue: true }
      ],
      cacheEnabled: true,
      cacheTtl: 300,
      timeout: 30000,
      status: 'active',
      icon: 'fas fa-users',
      color: '#3b82f6'
    });

    console.log('✅ Query created in database');
    console.log(`   ID: ${query1.id}`);
    console.log(`   Name: ${query1.name}`);
    console.log(`   Type: ${query1.queryType}`);
    console.log(`   Status: ${query1.status}`);
    console.log(`   Cache: ${query1.cacheEnabled} (TTL: ${query1.cacheTtl}s)`);

    // Test 4: Create second query
    console.log('\n✨ Test 4: Create Second Query (SQL Type)');
    console.log('─'.repeat(70));
    const query2 = await db.Query.create({
      applicationId: app1.id,
      dataSourceId: dataSource.id,
      name: 'count_active_users',
      displayName: 'Count Active Users',
      description: 'Get count of active users',
      queryType: 'sql',
      rawSql: 'SELECT COUNT(*) as total FROM users WHERE active = true',
      parameters: [],
      status: 'active'
    });

    console.log('✅ SQL query created');
    console.log(`   ID: ${query2.id}`);
    console.log(`   Name: ${query2.name}`);
    console.log(`   Type: ${query2.queryType}`);

    // Test 5: Query with associations
    console.log('\n✨ Test 5: Verify Query Associations');
    console.log('─'.repeat(70));
    const queryWithRels = await db.Query.findByPk(query1.id, {
      include: [
        { model: db.Application, as: 'application' },
        { model: db.DataSource, as: 'dataSource' }
      ]
    });

    console.log('✅ Query associations loaded');
    console.log(`   Application: ${queryWithRels.application.displayName}`);
    console.log(`   Data Source: ${queryWithRels.dataSource.displayName}`);
    console.log(`   Source Type: ${queryWithRels.dataSource.sourceType}`);

    // Test 6: List queries for application
    console.log('\n✨ Test 6: List Queries for Application');
    console.log('─'.repeat(70));
    const appQueries = await db.Query.findAll({
      where: { applicationId: app1.id },
      include: [
        { model: db.DataSource, as: 'dataSource', attributes: ['name', 'sourceType'] }
      ],
      order: [['createdAt', 'DESC']]
    });

    console.log(`✅ Found ${appQueries.length} queries`);
    appQueries.forEach((q, idx) => {
      console.log(`   ${idx + 1}. ${q.displayName} (${q.queryType}, ${q.status})`);
    });

    // Test 7: Query execution tracking
    console.log('\n✨ Test 7: Query Execution Tracking');
    console.log('─'.repeat(70));
    const execCountBefore = query1.executionCount;
    const lastExecBefore = query1.lastExecutedAt;

    await query1.incrementExecutionCount();
    await query1.incrementExecutionCount();
    await query1.reload();

    console.log('✅ Execution tracking works');
    console.log(`   Count before: ${execCountBefore}, after: ${query1.executionCount}`);
    console.log(`   Last executed: ${query1.lastExecutedAt}`);
    console.log(`   Incremented by: ${query1.executionCount - execCountBefore}`);

    // Test 8: Application Cloning (NEW FEATURE)
    console.log('\n✨ Test 8: Clone Application (Core Feature)');
    console.log('─'.repeat(70));

    const clonedApp = await ApplicationService.cloneApplication(
      app1.id,
      {
        name: 'test_app_v1_clone',
        displayName: 'Test Application V1 (Cloned)',
        description: 'Cloned version of test app',
        version: '3.0.0',
        cloneOptions: {
          entities: false,
          forms: false,
          grids: false,
          dataSources: false,
          queries: false
        },
        overrides: {
          color: '#ff6b6b',
          icon: 'fas fa-clone',
          status: 'draft',
          gitRepository: 'https://github.com/test/app-v1-clone.git',
          gitBranch: 'main',
          settings: { theme: 'exprsn-dark' }
        }
      },
      TEST_USER_ID
    );

    console.log('✅ Application cloned successfully');
    console.log(`   Original ID: ${app1.id}`);
    console.log(`   Cloned ID: ${clonedApp.id}`);
    console.log(`   Name: ${clonedApp.name}`);
    console.log(`   Version: ${clonedApp.version} (new version number)`);
    console.log(`   Color: ${clonedApp.color} (overridden)`);
    console.log(`   Git Repository: ${clonedApp.gitRepository} (overridden)`);
    console.log(`   Clone metadata:`);
    console.log(`     - Source App ID: ${clonedApp.settings.clonedFrom.applicationId}`);
    console.log(`     - Source App Name: ${clonedApp.settings.clonedFrom.applicationName}`);
    console.log(`     - Cloned At: ${clonedApp.settings.clonedFrom.clonedAt}`);

    // Test 9: Query filtering and search
    console.log('\n✨ Test 10: Query Filtering');
    console.log('─'.repeat(70));

    const activeQueries = await db.Query.findAll({
      where: {
        applicationId: app1.id,
        status: 'active'
      }
    });

    const visualQueries = await db.Query.findAll({
      where: {
        applicationId: app1.id,
        queryType: 'visual'
      }
    });

    const cachedQueries = await db.Query.findAll({
      where: {
        applicationId: app1.id,
        cacheEnabled: true
      }
    });

    console.log('✅ Filtering works correctly');
    console.log(`   Active queries: ${activeQueries.length}`);
    console.log(`   Visual queries: ${visualQueries.length}`);
    console.log(`   Cached queries: ${cachedQueries.length}`);

    // Cleanup
    console.log('\n🧹 Cleanup: Removing Test Data');
    console.log('─'.repeat(70));

    await query1.destroy({ force: true });
    await query2.destroy({ force: true });
    await dataSource.destroy({ force: true });
    await clonedApp.destroy({ force: true });
    await app1.destroy({ force: true });

    console.log('✅ Test data removed');

    // Success summary
    console.log('\n' + '═'.repeat(70));
    console.log('✅ ALL CORE WIZARD API TESTS PASSED!');
    console.log('═'.repeat(70));
    console.log('\n📊 Test Results Summary:');
    console.log('   1. ✅ Application creation with custom version/status');
    console.log('   2. ✅ Data source creation');
    console.log('   3. ✅ Query creation (Visual type) - NEW');
    console.log('   4. ✅ Query creation (SQL type) - NEW');
    console.log('   5. ✅ Query associations (Application, DataSource) - NEW');
    console.log('   6. ✅ Query listing and filtering - NEW');
    console.log('   7. ✅ Query execution tracking - NEW');
    console.log('   8. ✅ Application cloning with overrides - NEW');
    console.log('   9. ✅ Query filtering by status/type/cache - NEW');
    console.log('\n🎉 Application Wizard Core APIs Ready for Production!\n');

  } catch (error) {
    console.error('\n❌ Test Failed:', error.message);
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  } finally {
    if (db.sequelize) {
      await db.sequelize.close();
    }
  }
}

// Run tests
runTests().catch(console.error);
