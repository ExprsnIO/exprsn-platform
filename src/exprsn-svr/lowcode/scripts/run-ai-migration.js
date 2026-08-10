/**
 * Run AI Migration Directly
 *
 * Bypasses blocking migrations and runs only the AI migration.
 */

const path = require('path');
const { Sequelize } = require('sequelize');

async function runMigration() {
  console.log('\n🔄 Running AI Agent Core System Migration...\n');

  try {
    // Load database config
    const configPath = path.join(__dirname, '../../config/config.json');
    const config = require(configPath);
    const env = process.env.NODE_ENV || 'development';
    const dbConfig = config[env];

    // Create Sequelize instance
    const sequelize = new Sequelize(
      dbConfig.database,
      dbConfig.username,
      dbConfig.password,
      {
        host: dbConfig.host,
        dialect: dbConfig.dialect,
        logging: (msg) => console.log(`  ${msg}`),
      }
    );

    console.log('✓ Connected to database:', dbConfig.database);
    console.log('');

    // Load the migration file
    const migrationPath = path.join(__dirname, '../../migrations/20251226000000-create-ai-agent-core-system.js');
    const migration = require(migrationPath);

    // Check if already run
    const [existing] = await sequelize.query(`
      SELECT * FROM "SequelizeMeta"
      WHERE name = '20251226000000-create-ai-agent-core-system.js'
    `);

    if (existing && existing.length > 0) {
      console.log('⚠️  Migration already applied!');
      console.log('   Tables should already exist.');
      console.log('');
      await sequelize.close();
      return;
    }

    // Run the migration
    console.log('📊 Creating AI tables...');
    console.log('');
    await migration.up(sequelize.getQueryInterface(), Sequelize);

    // Record in SequelizeMeta
    await sequelize.query(`
      INSERT INTO "SequelizeMeta" (name)
      VALUES ('20251226000000-create-ai-agent-core-system.js')
    `);

    console.log('');
    console.log('✅ AI Agent Core System migration completed successfully!');
    console.log('');
    console.log('Tables created:');
    console.log('  • ai_provider_configs');
    console.log('  • ai_agent_templates');
    console.log('  • ai_agent_configurations');
    console.log('  • ai_execution_logs');
    console.log('  • ai_schema_suggestions');
    console.log('  • ai_data_transformations');
    console.log('  • ai_conversation_sessions');
    console.log('  • ai_conversation_messages');
    console.log('  • ai_workflow_optimizations');
    console.log('  • ai_decision_evaluations');
    console.log('');

    await sequelize.close();

  } catch (error) {
    console.error('\n❌ Migration failed:');
    console.error(error.message);
    console.error('');

    if (error.message.includes('already exists')) {
      console.log('ℹ️  Tables may already exist from a previous run.');
      console.log('   Run tests to verify: node scripts/test-ai-integration.js');
    }

    process.exit(1);
  }
}

runMigration();
