/**
 * Run HTML App Builder Migration Directly
 * Bypasses Sequelize CLI to avoid migration order issues
 */

const { Sequelize } = require('sequelize');
const path = require('path');

// Database configuration
const sequelize = new Sequelize({
  dialect: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'exprsn_svr',
  username: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  logging: console.log
});

async function runMigration() {
  try {
    console.log('🔍 Testing database connection...');
    await sequelize.authenticate();
    console.log('✅ Database connection successful');

    console.log('\n📦 Loading HTML App Builder migration...');
    const migration = require('../lowcode/migrations/20251225000001-create-html-app-builder.js');

    console.log('\n🚀 Running migration...');
    await migration.up(sequelize.getQueryInterface(), Sequelize);

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📊 Tables created:');
    console.log('   - html_projects');
    console.log('   - html_files');
    console.log('   - html_file_versions');
    console.log('   - html_components');
    console.log('   - html_libraries');
    console.log('   - html_project_libraries');
    console.log('   - html_project_components');
    console.log('   - html_collaboration_sessions');
    console.log('   - html_project_snapshots');
    console.log('   - html_data_sources');
    console.log('   - html_project_deployments');

    // Record migration in SequelizeMeta
    console.log('\n📝 Recording migration...');
    await sequelize.query(
      "INSERT INTO \"SequelizeMeta\" (name) VALUES ('20251225000001-create-html-app-builder.js') ON CONFLICT DO NOTHING"
    );

    console.log('✅ Migration recorded');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('\nFull error:', error);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

runMigration();
