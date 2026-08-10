/**
 * ═══════════════════════════════════════════════════════════
 * Git Setup Test Script
 * Tests migration and model associations
 * ═══════════════════════════════════════════════════════════
 */

const path = require('path');
const { sequelize } = require('../models');

// Import all models
const getModels = () => require('../models');

const testGitSetup = async () => {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('Git/CI/CD Setup Test');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // Test 1: Database connection
    console.log('Test 1: Database Connection');
    console.log('────────────────────────────────────────────────────────');
    await sequelize.authenticate();
    console.log('✓ Database connection successful\n');

    const models = getModels();

    // Test 2: Model loading
    console.log('Test 2: Model Loading');
    console.log('────────────────────────────────────────────────────────');

    const gitSetupModels = [
      'GitSystemConfig',
      'GitRepositoryTemplate',
      'GitSSHKey',
      'GitPersonalAccessToken',
      'GitRepositoryPolicy',
      'GitRunner',
      'GitEnvironmentVariable',
      'GitCodeOwner',
      'GitIssueTemplate',
      'GitDeploymentEnvironment',
      'GitRegistryConfig',
      'GitSecurityScanConfig',
      'GitSecurityScanResult',
      'GitMergeTrain',
      'GitOAuthApplication',
      'GitPipelineArtifact',
      'GitPipelineCache',
      'GitAuditLog'
    ];

    let loadedCount = 0;
    for (const modelName of gitSetupModels) {
      if (models[modelName]) {
        console.log(`✓ ${modelName} loaded`);
        loadedCount++;
      } else {
        console.log(`✗ ${modelName} NOT loaded`);
      }
    }
    console.log(`\nLoaded ${loadedCount}/${gitSetupModels.length} Git setup models\n`);

    // Test 3: Table existence
    console.log('Test 3: Database Tables');
    console.log('────────────────────────────────────────────────────────');

    const queryInterface = sequelize.getQueryInterface();
    const tables = await queryInterface.showAllTables();

    const expectedTables = [
      'git_system_config',
      'git_repository_templates',
      'git_ssh_keys',
      'git_personal_access_tokens',
      'git_repository_policies',
      'git_runners',
      'git_environment_variables',
      'git_code_owners',
      'git_issue_templates',
      'git_deployment_environments',
      'git_registry_config',
      'git_security_scan_config',
      'git_security_scan_results',
      'git_merge_trains',
      'git_oauth_applications',
      'git_pipeline_artifacts',
      'git_pipeline_cache',
      'git_audit_logs'
    ];

    let tableCount = 0;
    for (const table of expectedTables) {
      if (tables.includes(table)) {
        console.log(`✓ ${table} exists`);
        tableCount++;
      } else {
        console.log(`✗ ${table} does NOT exist`);
      }
    }
    console.log(`\nFound ${tableCount}/${expectedTables.length} Git setup tables\n`);

    // Test 4: Model associations
    console.log('Test 4: Model Associations');
    console.log('────────────────────────────────────────────────────────');

    const {
      GitRepository,
      GitRepositoryPolicy,
      GitEnvironmentVariable,
      GitDeploymentEnvironment,
      GitPipeline,
      GitPipelineRun,
      GitPipelineArtifact,
      GitSecurityScanConfig,
      GitSecurityScanResult
    } = models;

    const associationTests = [
      {
        model: 'GitRepository',
        association: 'policies',
        exists: GitRepository?.associations?.policies !== undefined
      },
      {
        model: 'GitRepository',
        association: 'environmentVariables',
        exists: GitRepository?.associations?.environmentVariables !== undefined
      },
      {
        model: 'GitRepository',
        association: 'deploymentEnvironments',
        exists: GitRepository?.associations?.deploymentEnvironments !== undefined
      },
      {
        model: 'GitPipelineRun',
        association: 'artifacts',
        exists: GitPipelineRun?.associations?.artifacts !== undefined
      },
      {
        model: 'GitSecurityScanConfig',
        association: 'results',
        exists: GitSecurityScanConfig?.associations?.results !== undefined
      }
    ];

    let associationCount = 0;
    for (const test of associationTests) {
      if (test.exists) {
        console.log(`✓ ${test.model}.${test.association} association exists`);
        associationCount++;
      } else {
        console.log(`✗ ${test.model}.${test.association} association NOT found`);
      }
    }
    console.log(`\nFound ${associationCount}/${associationTests.length} test associations\n`);

    // Test 5: Basic CRUD operations
    console.log('Test 5: CRUD Operations');
    console.log('────────────────────────────────────────────────────────');

    const { GitSystemConfig } = models;

    // Create
    const testConfig = await GitSystemConfig.create({
      key: 'test.config.key',
      value: { test: 'value' },
      type: 'system',
      encrypted: false
    });
    console.log('✓ Created test configuration');

    // Read
    const foundConfig = await GitSystemConfig.findByPk(testConfig.id);
    console.log('✓ Read test configuration');

    // Update
    await foundConfig.update({ value: { test: 'updated' } });
    console.log('✓ Updated test configuration');

    // Delete
    await foundConfig.destroy();
    console.log('✓ Deleted test configuration\n');

    // Test 6: Data validation
    console.log('Test 6: Data Validation');
    console.log('────────────────────────────────────────────────────────');

    try {
      // Test missing required field
      await GitSystemConfig.create({
        key: 'test.invalid',
        value: {}
        // Missing required 'type' field
      });
      console.log('✗ Validation failed to catch missing type');
    } catch (error) {
      console.log('✓ Type validation working');
    }

    try {
      const GitEnvironmentVariable = models.GitEnvironmentVariable;
      // Test invalid environment variable key (should be uppercase)
      await GitEnvironmentVariable.create({
        key: 'invalid-key',
        value: 'test',
        scope: 'global',
        createdBy: '00000000-0000-0000-0000-000000000000'
      });
      console.log('✗ Validation failed to catch invalid key format');
    } catch (error) {
      console.log('✓ Environment variable key validation working');
    }

    console.log('');

    // Summary
    console.log('═══════════════════════════════════════════════════════════');
    console.log('Test Summary');
    console.log('═══════════════════════════════════════════════════════════\n');

    const allTestsPassed = (
      loadedCount === gitSetupModels.length &&
      tableCount === expectedTables.length &&
      associationCount === associationTests.length
    );

    if (allTestsPassed) {
      console.log('✓ All tests passed!');
      console.log('\nGit/CI/CD setup is ready to use.');
      console.log('\nNext step: Run initialization script');
      console.log('  node src/exprsn-svr/lowcode/scripts/init-git-setup.js');
    } else {
      console.log('⚠ Some tests failed. Please review the output above.');
      if (loadedCount < gitSetupModels.length) {
        console.log(`  - ${gitSetupModels.length - loadedCount} models not loaded`);
      }
      if (tableCount < expectedTables.length) {
        console.log(`  - ${expectedTables.length - tableCount} tables missing (run migration)`);
      }
      if (associationCount < associationTests.length) {
        console.log(`  - ${associationTests.length - associationCount} associations not found`);
      }
    }

    console.log('');

  } catch (error) {
    console.error('✗ Test failed with error:', error);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
};

// Run tests
if (require.main === module) {
  testGitSetup()
    .then(() => {
      process.exit(0);
    })
    .catch(error => {
      console.error('Test execution failed:', error);
      process.exit(1);
    });
}

module.exports = testGitSetup;
