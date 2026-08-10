/**
 * Database Management Module
 * SQL upload, schema initialization, and database creation for all services
 */

const { Client } = require('pg');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../utils/logger');
const { SERVICE_DEFINITIONS } = require('./discovery');

/**
 * Database configurations for each service
 */
const SERVICE_DATABASES = {
  'exprsn-ca': 'exprsn_ca',
  'exprsn-auth': 'exprsn_auth',
  'exprsn-spark': 'exprsn_spark',
  'exprsn-timeline': 'exprsn_timeline',
  'exprsn-prefetch': 'exprsn_prefetch',
  'exprsn-moderator': 'exprsn_moderator',
  'exprsn-filevault': 'exprsn_filevault',
  'exprsn-gallery': 'exprsn_gallery',
  'exprsn-live': 'exprsn_live',
  'exprsn-bridge': 'exprsn_bridge',
  'exprsn-nexus': 'exprsn_nexus',
  'exprsn-pulse': 'exprsn_pulse',
  'exprsn-vault': 'exprsn_vault',
  'exprsn-herald': 'exprsn_herald'
};

/**
 * Get database client
 * @param {Object} config - Database configuration
 * @returns {Client} PostgreSQL client
 */
function getClient(config) {
  return new Client({
    host: config.host || 'localhost',
    port: config.port || 5432,
    database: config.database || 'postgres',
    user: config.user || 'postgres',
    password: config.password
  });
}

/**
 * Check if database exists
 * @param {string} dbName - Database name
 * @param {Object} config - Connection configuration
 * @returns {Promise<boolean>} True if database exists
 */
async function databaseExists(dbName, config) {
  const client = getClient({ ...config, database: 'postgres' });

  try {
    await client.connect();

    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [dbName]
    );

    await client.end();

    return result.rows.length > 0;
  } catch (error) {
    logger.error(`Error checking database existence: ${error.message}`);
    throw error;
  }
}

/**
 * Create database
 * @param {string} dbName - Database name
 * @param {Object} config - Connection configuration
 * @returns {Promise<Object>} Creation result
 */
async function createDatabase(dbName, config) {
  logger.info(`Creating database: ${dbName}`);

  const exists = await databaseExists(dbName, config);
  if (exists) {
    logger.info(`Database ${dbName} already exists`);
    return {
      success: true,
      created: false,
      message: 'Database already exists'
    };
  }

  const client = getClient({ ...config, database: 'postgres' });

  try {
    await client.connect();

    // Create database
    await client.query(`CREATE DATABASE ${dbName}`);

    await client.end();

    logger.info(`Database ${dbName} created successfully`);

    return {
      success: true,
      created: true,
      message: 'Database created successfully'
    };
  } catch (error) {
    logger.error(`Error creating database ${dbName}:`, error);
    throw error;
  }
}

/**
 * Execute SQL script on database
 * @param {string} dbName - Database name
 * @param {string} sqlContent - SQL script content
 * @param {Object} config - Connection configuration
 * @returns {Promise<Object>} Execution result
 */
async function executeSQLScript(dbName, sqlContent, config) {
  logger.info(`Executing SQL script on database: ${dbName}`);

  const client = getClient({ ...config, database: dbName });

  try {
    await client.connect();

    // Execute SQL (may contain multiple statements)
    const result = await client.query(sqlContent);

    await client.end();

    logger.info(`SQL script executed successfully on ${dbName}`);

    return {
      success: true,
      message: 'SQL script executed successfully',
      rowCount: result.rowCount
    };
  } catch (error) {
    logger.error(`Error executing SQL on ${dbName}:`, error);
    throw error;
  }
}

/**
 * Upload and execute SQL file
 * @param {string} dbName - Database name
 * @param {string} filePath - Path to SQL file
 * @param {Object} config - Connection configuration
 * @returns {Promise<Object>} Upload result
 */
async function uploadSQLFile(dbName, filePath, config) {
  logger.info(`Uploading SQL file to ${dbName}: ${filePath}`);

  try {
    // Read SQL file
    const sqlContent = await fs.readFile(filePath, 'utf8');

    // Execute SQL
    const result = await executeSQLScript(dbName, sqlContent, config);

    return {
      ...result,
      fileName: path.basename(filePath),
      fileSize: sqlContent.length
    };
  } catch (error) {
    logger.error(`Error uploading SQL file:`, error);
    throw error;
  }
}

/**
 * Initialize database schema for a service
 * @param {string} serviceId - Service identifier
 * @param {Object} config - Connection configuration
 * @returns {Promise<Object>} Initialization result
 */
async function initializeServiceDatabase(serviceId, config) {
  logger.info(`Initializing database for service: ${serviceId}`);

  const dbName = SERVICE_DATABASES[serviceId];
  if (!dbName) {
    throw new Error(`Unknown service: ${serviceId}`);
  }

  // Create database if it doesn't exist
  await createDatabase(dbName, config);

  // Look for schema file in database directory
  const projectRoot = path.resolve(__dirname, '../../../..');
  const schemaPath = path.join(projectRoot, 'database', `${serviceId}-schema.sql`);

  try {
    await fs.access(schemaPath);
    // Schema file exists, execute it
    logger.info(`Found schema file: ${schemaPath}`);
    const result = await uploadSQLFile(dbName, schemaPath, config);

    return {
      success: true,
      database: dbName,
      schemaApplied: true,
      ...result
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Schema file not found
      logger.warn(`No schema file found for ${serviceId} at ${schemaPath}`);
      return {
        success: true,
        database: dbName,
        schemaApplied: false,
        message: 'Database created but no schema file found'
      };
    }
    throw error;
  }
}

/**
 * Create all service databases
 * @param {Object} config - Connection configuration
 * @returns {Promise<Array>} Array of creation results
 */
async function createAllServiceDatabases(config) {
  logger.info('Creating databases for all services...');

  const results = [];

  for (const [serviceId, dbName] of Object.entries(SERVICE_DATABASES)) {
    try {
      const result = await createDatabase(dbName, config);
      results.push({
        service: serviceId,
        database: dbName,
        ...result
      });
    } catch (error) {
      logger.error(`Failed to create database for ${serviceId}:`, error);
      results.push({
        service: serviceId,
        database: dbName,
        success: false,
        error: error.message
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  logger.info(`Database creation complete: ${successCount}/${results.length} successful`);

  return results;
}

/**
 * Initialize all service databases with schemas
 * @param {Object} config - Connection configuration
 * @returns {Promise<Array>} Array of initialization results
 */
async function initializeAllServiceDatabases(config) {
  logger.info('Initializing all service databases...');

  const results = [];

  for (const serviceId of Object.keys(SERVICE_DATABASES)) {
    try {
      const result = await initializeServiceDatabase(serviceId, config);
      results.push({
        service: serviceId,
        ...result
      });
    } catch (error) {
      logger.error(`Failed to initialize database for ${serviceId}:`, error);
      results.push({
        service: serviceId,
        success: false,
        error: error.message
      });
    }
  }

  const successCount = results.filter(r => r.success).length;
  logger.info(`Database initialization complete: ${successCount}/${results.length} successful`);

  return results;
}

/**
 * Get database schema from file
 * @param {string} serviceId - Service identifier
 * @returns {Promise<string>} Schema SQL content
 */
async function getServiceSchema(serviceId) {
  const projectRoot = path.resolve(__dirname, '../../../..');
  const schemaPath = path.join(projectRoot, 'database', `${serviceId}-schema.sql`);

  try {
    const schema = await fs.readFile(schemaPath, 'utf8');
    return schema;
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error(`Schema file not found for ${serviceId}`);
    }
    throw error;
  }
}

/**
 * Get database info for a service
 * @param {string} serviceId - Service identifier
 * @param {Object} config - Connection configuration
 * @returns {Promise<Object>} Database information
 */
async function getDatabaseInfo(serviceId, config) {
  const dbName = SERVICE_DATABASES[serviceId];
  if (!dbName) {
    throw new Error(`Unknown service: ${serviceId}`);
  }

  const exists = await databaseExists(dbName, config);

  if (!exists) {
    return {
      service: serviceId,
      database: dbName,
      exists: false
    };
  }

  const client = getClient({ ...config, database: dbName });

  try {
    await client.connect();

    // Get table count
    const tablesResult = await client.query(`
      SELECT COUNT(*) as count
      FROM information_schema.tables
      WHERE table_schema = 'public'
    `);

    // Get database size
    const sizeResult = await client.query(`
      SELECT pg_size_pretty(pg_database_size($1)) as size
    `, [dbName]);

    await client.end();

    return {
      service: serviceId,
      database: dbName,
      exists: true,
      tables: parseInt(tablesResult.rows[0].count),
      size: sizeResult.rows[0].size
    };
  } catch (error) {
    logger.error(`Error getting database info for ${serviceId}:`, error);
    throw error;
  }
}

/**
 * Drop database (dangerous operation)
 * @param {string} dbName - Database name
 * @param {Object} config - Connection configuration
 * @returns {Promise<Object>} Drop result
 */
async function dropDatabase(dbName, config) {
  logger.warn(`Dropping database: ${dbName}`);

  const client = getClient({ ...config, database: 'postgres' });

  try {
    await client.connect();

    // Terminate all connections to the database
    await client.query(`
      SELECT pg_terminate_backend(pg_stat_activity.pid)
      FROM pg_stat_activity
      WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
    `, [dbName]);

    // Drop database
    await client.query(`DROP DATABASE IF EXISTS ${dbName}`);

    await client.end();

    logger.info(`Database ${dbName} dropped successfully`);

    return {
      success: true,
      message: 'Database dropped successfully'
    };
  } catch (error) {
    logger.error(`Error dropping database ${dbName}:`, error);
    throw error;
  }
}

module.exports = {
  databaseExists,
  createDatabase,
  executeSQLScript,
  uploadSQLFile,
  initializeServiceDatabase,
  createAllServiceDatabases,
  initializeAllServiceDatabases,
  getServiceSchema,
  getDatabaseInfo,
  dropDatabase,
  SERVICE_DATABASES
};
