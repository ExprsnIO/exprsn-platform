/**
 * ═══════════════════════════════════════════════════════════
 * Database Setup Script
 * Create database and apply schema
 * ═══════════════════════════════════════════════════════════
 */

require('dotenv').config();
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  console.log('Setting up Exprsn Moderator database...\n');

  const dbName = process.env.DB_NAME || 'exprsn_moderator';
  const dbUser = process.env.DB_USER || 'postgres';
  const dbPassword = process.env.DB_PASSWORD || 'postgres';
  const dbHost = process.env.DB_HOST || 'localhost';
  const dbPort = process.env.DB_PORT || 5432;

  // Connect to postgres database to create our database
  const adminClient = new Client({
    user: dbUser,
    host: dbHost,
    database: 'postgres',
    password: dbPassword,
    port: dbPort
  });

  try {
    await adminClient.connect();
    console.log('✓ Connected to PostgreSQL server');

    // Check if database exists
    const dbCheck = await adminClient.query(
      "SELECT 1 FROM pg_database WHERE datname = $1",
      [dbName]
    );

    if (dbCheck.rowCount === 0) {
      // Create database
      await adminClient.query(`CREATE DATABASE ${dbName}`);
      console.log(`✓ Created database: ${dbName}`);
    } else {
      console.log(`✓ Database already exists: ${dbName}`);
    }

    await adminClient.end();

    // Connect to our database and apply schema
    const client = new Client({
      user: dbUser,
      host: dbHost,
      database: dbName,
      password: dbPassword,
      port: dbPort
    });

    await client.connect();
    console.log(`✓ Connected to database: ${dbName}`);

    // Read schema file
    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Apply schema
    await client.query(schema);
    console.log('✓ Database schema applied successfully');

    // Verify tables created
    const tables = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log(`\n✓ Created ${tables.rowCount} tables:`);
    tables.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });

    await client.end();

    console.log('\n✓ Database setup completed successfully!');
    process.exit(0);

  } catch (error) {
    console.error('\n✗ Database setup failed:', error.message);
    process.exit(1);
  }
}

// Run setup
setupDatabase();
