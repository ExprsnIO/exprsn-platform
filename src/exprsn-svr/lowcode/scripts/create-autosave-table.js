/**
 * Create form_autosaves table
 *
 * Run this script to manually create the autosave table.
 */

const { Sequelize } = require('sequelize');

async function createAutosaveTable() {
  // Create Sequelize connection
  const sequelize = new Sequelize(
    process.env.DB_NAME || 'exprsn_svr',
    process.env.DB_USER || 'postgres',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      dialect: 'postgres',
      logging: console.log
    }
  );

  try {
    await sequelize.authenticate();
    console.log('✓ Database connection established');

    // Create table
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS form_autosaves (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        form_id UUID NOT NULL UNIQUE,
        form_name VARCHAR(255) NOT NULL DEFAULT 'Untitled Form',
        schema JSONB NOT NULL DEFAULT '{}'::jsonb,
        components JSONB NOT NULL DEFAULT '[]'::jsonb,
        custom_functions JSONB NOT NULL DEFAULT '{}'::jsonb,
        variables JSONB NOT NULL DEFAULT '[]'::jsonb,
        timestamp BIGINT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        user_id VARCHAR(255),
        saved_at TIMESTAMP NOT NULL DEFAULT NOW(),
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);
    console.log('✓ Table form_autosaves created');

    // Create indexes
    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_form_autosaves_form_id ON form_autosaves(form_id);
    `);
    console.log('✓ Index idx_form_autosaves_form_id created');

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_form_autosaves_user_id ON form_autosaves(user_id);
    `);
    console.log('✓ Index idx_form_autosaves_user_id created');

    await sequelize.query(`
      CREATE INDEX IF NOT EXISTS idx_form_autosaves_saved_at ON form_autosaves(saved_at);
    `);
    console.log('✓ Index idx_form_autosaves_saved_at created');

    console.log('\n✓ Form autosaves table setup complete!');
  } catch (error) {
    console.error('✗ Error creating autosave table:', error.message);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

createAutosaveTable();
