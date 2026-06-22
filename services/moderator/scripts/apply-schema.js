/**
 * Apply Database Schema Script
 * Reads schema.sql and applies it to the database
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Sequelize } = require('sequelize');

const config = {
  host: process.env.MODERATOR_PG_HOST || 'localhost',
  port: parseInt(process.env.MODERATOR_PG_PORT) || 5432,
  database: process.env.MODERATOR_PG_DATABASE || 'exprsn_moderator',
  username: process.env.MODERATOR_PG_USER || 'postgres',
  password: process.env.MODERATOR_PG_PASSWORD || '',
  dialect: 'postgres',
  logging: false
};

async function applySchema() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Exprsn Moderator - Database Schema Setup');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('Database Configuration:');
  console.log(`  Host: ${config.host}`);
  console.log(`  Port: ${config.port}`);
  console.log(`  Database: ${config.database}`);
  console.log(`  User: ${config.username}\n`);

  // Create Sequelize instance
  const sequelize = new Sequelize(config);

  try {
    // Test connection
    console.log('Testing database connection...');
    await sequelize.authenticate();
    console.log('✓ Database connection successful\n');

    // Read schema file
    const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
    console.log(`Reading schema from: ${schemaPath}`);

    if (!fs.existsSync(schemaPath)) {
      throw new Error('Schema file not found: ' + schemaPath);
    }

    const schema = fs.readFileSync(schemaPath, 'utf8');
    console.log(`✓ Schema file loaded (${schema.length} bytes)\n`);

    // Split schema into individual statements
    // Remove comments and split by semicolon
    const statements = schema
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && line.trim().length > 0)
      .join('\n')
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0);

    console.log(`Found ${statements.length} SQL statements\n`);
    console.log('Applying schema...\n');

    let successCount = 0;
    let errorCount = 0;

    // Execute each statement
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];

      // Skip empty statements
      if (!stmt || stmt.length < 10) continue;

      // Get statement type for logging
      const stmtType = stmt.substring(0, 50).replace(/\s+/g, ' ');

      try {
        await sequelize.query(stmt);
        successCount++;

        // Log progress for major operations
        if (stmt.includes('CREATE TABLE') || stmt.includes('CREATE TYPE') ||
            stmt.includes('CREATE EXTENSION') || stmt.includes('CREATE INDEX')) {
          console.log(`  ✓ ${stmtType}...`);
        }
      } catch (error) {
        // Ignore "already exists" errors
        if (error.message.includes('already exists') ||
            error.message.includes('duplicate')) {
          console.log(`  ⚠ ${stmtType}... (already exists)`);
        } else {
          errorCount++;
          console.error(`  ✗ ${stmtType}...`);
          console.error(`    Error: ${error.message}`);
        }
      }
    }

    console.log('\n───────────────────────────────────────────────────────────');
    console.log(`Schema application complete:`);
    console.log(`  ✓ Success: ${successCount} statements`);
    console.log(`  ✗ Errors: ${errorCount} statements`);
    console.log('───────────────────────────────────────────────────────────\n');

    // Verify tables were created
    console.log('Verifying database tables...');
    const [tables] = await sequelize.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`\n✓ Found ${tables.length} tables:`);
    tables.forEach(table => {
      console.log(`  - ${table.table_name}`);
    });

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  Database schema setup complete!');
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('\n✗ Error applying schema:');
    console.error(error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run script
applySchema().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
