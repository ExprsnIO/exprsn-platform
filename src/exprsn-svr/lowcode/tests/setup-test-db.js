#!/usr/bin/env node
/**
 * Test Database Setup Script
 * Creates test database and runs migrations
 */

const { Pool } = require('pg');

// Admin connection to create database
const adminPool = new Pool({
  host: process.env.TEST_DB_HOST || 'localhost',
  port: process.env.TEST_DB_PORT || 5432,
  database: 'postgres', // Connect to default postgres DB
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

// Test database connection
const testPool = new Pool({
  host: process.env.TEST_DB_HOST || 'localhost',
  port: process.env.TEST_DB_PORT || 5432,
  database: 'exprsn_svr_test',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || ''
});

async function setupTestDatabase() {
  try {
    console.log('🗄️  Setting up test database...\n');

    // Check if test database exists
    const checkDb = await adminPool.query(`
      SELECT 1 FROM pg_database WHERE datname = 'exprsn_svr_test'
    `);

    if (checkDb.rows.length === 0) {
      console.log('📦 Creating test database: exprsn_svr_test');
      await adminPool.query('CREATE DATABASE exprsn_svr_test');
      console.log('✅ Test database created\n');
    } else {
      console.log('✅ Test database already exists\n');
    }

    // Create necessary tables for integration tests
    console.log('📋 Creating test schema...');

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS applications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL UNIQUE,
        display_name VARCHAR(255) NOT NULL,
        description TEXT,
        icon VARCHAR(255),
        status VARCHAR(50) DEFAULT 'draft',
        created_by UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      )
    `);
    console.log('✅ applications table ready');

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS entities (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        application_id UUID REFERENCES applications(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        table_name VARCHAR(255) NOT NULL,
        display_name VARCHAR(255),
        description TEXT,
        icon VARCHAR(100),
        schema JSONB NOT NULL DEFAULT '{}',
        migrations JSONB DEFAULT '[]',
        version INTEGER DEFAULT 1,
        locked BOOLEAN DEFAULT false,
        locked_by UUID,
        locked_at TIMESTAMP WITH TIME ZONE,
        created_by UUID,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(application_id, name),
        UNIQUE(application_id, table_name)
      )
    `);
    console.log('✅ entities table ready');

    await testPool.query(`
      CREATE TABLE IF NOT EXISTS entity_fields (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        entity_id UUID REFERENCES entities(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        label VARCHAR(255),
        type VARCHAR(50) NOT NULL,
        description TEXT,
        required BOOLEAN DEFAULT false,
        unique_constraint BOOLEAN DEFAULT false,
        default_value TEXT,
        validation JSONB,
        config JSONB,
        display_order INTEGER DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        UNIQUE(entity_id, name)
      )
    `);
    console.log('✅ entity_fields table ready');

    await testPool.query(`
      CREATE INDEX IF NOT EXISTS idx_entities_app_id ON entities(application_id);
      CREATE INDEX IF NOT EXISTS idx_entity_fields_entity_id ON entity_fields(entity_id);
    `);
    console.log('✅ indexes created');

    console.log('\n🎉 Test database setup complete!\n');
    console.log('Database: exprsn_svr_test');
    console.log('Tables:   applications, entities, entity_fields');
    console.log('\nYou can now run integration tests:\n');
    console.log('  npm test -- lowcode/tests/integration/\n');

  } catch (error) {
    console.error('❌ Error setting up test database:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await adminPool.end();
    await testPool.end();
  }
}

// Run setup
setupTestDatabase();
