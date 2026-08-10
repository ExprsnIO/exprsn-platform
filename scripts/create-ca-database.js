#!/usr/bin/env node
/**
 * Create CA database and user
 */

const { Client } = require('pg');

async function createDatabase() {
  // Connect to postgres database to create new database
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    database: 'postgres',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || ''
  });

  try {
    await client.connect();
    console.log('✓ Connected to PostgreSQL');

    // Create database
    try {
      await client.query('CREATE DATABASE exprsn_ca');
      console.log('✓ Created database: exprsn_ca');
    } catch (err) {
      if (err.code === '42P04') {
        console.log('ℹ Database exprsn_ca already exists');
      } else {
        throw err;
      }
    }

    // Create user
    try {
      await client.query("CREATE USER exprsn_ca_user WITH PASSWORD ''");
      console.log('✓ Created user: exprsn_ca_user');
    } catch (err) {
      if (err.code === '42710') {
        console.log('ℹ User exprsn_ca_user already exists');
      } else {
        throw err;
      }
    }

    // Grant privileges
    await client.query('GRANT ALL PRIVILEGES ON DATABASE exprsn_ca TO exprsn_ca_user');
    console.log('✓ Granted database privileges to exprsn_ca_user');

    await client.end();

    // Grant schema privileges
    const schemaClient = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: 'exprsn_ca',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || ''
    });

    await schemaClient.connect();
    await schemaClient.query('GRANT ALL ON SCHEMA public TO exprsn_ca_user');
    await schemaClient.query('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO exprsn_ca_user');
    await schemaClient.query('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO exprsn_ca_user');
    await schemaClient.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO exprsn_ca_user');
    await schemaClient.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO exprsn_ca_user');
    console.log('✓ Granted schema privileges to exprsn_ca_user');
    await schemaClient.end();

    // Now connect to the new database to apply schema
    console.log('\nApplying database schema...');
    const fs = require('fs');
    const path = require('path');

    const schemaPath = path.join(__dirname, '../database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    const dbClient = new Client({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT, 10) || 5432,
      database: 'exprsn_ca',
      user: process.env.DB_USER || 'exprsn_ca_user',
      password: process.env.DB_PASSWORD || ''
    });

    await dbClient.connect();
    await dbClient.query(schema);
    console.log('✓ Schema applied successfully');

    await dbClient.end();

    console.log('\n✓ CA database setup complete!');
    process.exit(0);
  } catch (error) {
    console.error('✗ Error:', error.message);
    process.exit(1);
  }
}

createDatabase();
