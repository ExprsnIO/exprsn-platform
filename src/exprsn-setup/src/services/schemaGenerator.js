/**
 * Database Schema Generator
 * Creates custom database tables, views, functions, and other schema items
 */

const { Client } = require('pg');
const logger = require('../utils/logger');
const { databaseExists } = require('./database');

/**
 * PostgreSQL data types
 */
const POSTGRES_TYPES = {
  // Numeric types
  INTEGER: 'INTEGER',
  BIGINT: 'BIGINT',
  SMALLINT: 'SMALLINT',
  DECIMAL: 'DECIMAL',
  NUMERIC: 'NUMERIC',
  REAL: 'REAL',
  DOUBLE_PRECISION: 'DOUBLE PRECISION',
  SERIAL: 'SERIAL',
  BIGSERIAL: 'BIGSERIAL',

  // String types
  VARCHAR: 'VARCHAR',
  CHAR: 'CHAR',
  TEXT: 'TEXT',

  // Date/Time types
  DATE: 'DATE',
  TIME: 'TIME',
  TIMESTAMP: 'TIMESTAMP',
  TIMESTAMPTZ: 'TIMESTAMPTZ',
  INTERVAL: 'INTERVAL',

  // Boolean
  BOOLEAN: 'BOOLEAN',

  // Binary
  BYTEA: 'BYTEA',

  // JSON
  JSON: 'JSON',
  JSONB: 'JSONB',

  // Array types
  ARRAY: 'ARRAY',

  // UUID
  UUID: 'UUID',

  // Network types
  INET: 'INET',
  CIDR: 'CIDR',
  MACADDR: 'MACADDR'
};

/**
 * Common column constraints
 */
const CONSTRAINTS = {
  PRIMARY_KEY: 'PRIMARY KEY',
  NOT_NULL: 'NOT NULL',
  UNIQUE: 'UNIQUE',
  CHECK: 'CHECK',
  FOREIGN_KEY: 'FOREIGN KEY',
  DEFAULT: 'DEFAULT'
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
    database: config.database,
    user: config.user || 'postgres',
    password: config.password
  });
}

/**
 * Generate CREATE TABLE SQL statement
 * @param {Object} tableConfig - Table configuration
 * @returns {string} CREATE TABLE SQL
 */
function generateCreateTableSQL(tableConfig) {
  const { tableName, columns, constraints = [], ifNotExists = true } = tableConfig;

  let sql = `CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}${tableName} (\n`;

  // Add columns
  const columnDefinitions = columns.map(col => {
    let colDef = `  ${col.name} ${col.type}`;

    if (col.length) {
      colDef += `(${col.length})`;
    }

    if (col.primaryKey) {
      colDef += ' PRIMARY KEY';
    }

    if (col.notNull && !col.primaryKey) {
      colDef += ' NOT NULL';
    }

    if (col.unique) {
      colDef += ' UNIQUE';
    }

    if (col.default !== undefined) {
      if (typeof col.default === 'string') {
        colDef += ` DEFAULT '${col.default}'`;
      } else if (col.default === 'NOW()' || col.default === 'CURRENT_TIMESTAMP') {
        colDef += ` DEFAULT ${col.default}`;
      } else {
        colDef += ` DEFAULT ${col.default}`;
      }
    }

    if (col.check) {
      colDef += ` CHECK (${col.check})`;
    }

    if (col.references) {
      colDef += ` REFERENCES ${col.references.table}(${col.references.column})`;
      if (col.references.onDelete) {
        colDef += ` ON DELETE ${col.references.onDelete}`;
      }
      if (col.references.onUpdate) {
        colDef += ` ON UPDATE ${col.references.onUpdate}`;
      }
    }

    return colDef;
  });

  sql += columnDefinitions.join(',\n');

  // Add table-level constraints
  if (constraints.length > 0) {
    sql += ',\n  ' + constraints.join(',\n  ');
  }

  sql += '\n);';

  return sql;
}

/**
 * Generate CREATE INDEX SQL statement
 * @param {Object} indexConfig - Index configuration
 * @returns {string} CREATE INDEX SQL
 */
function generateCreateIndexSQL(indexConfig) {
  const {
    indexName,
    tableName,
    columns,
    unique = false,
    method = 'btree', // btree, hash, gist, gin, etc.
    where,
    ifNotExists = true
  } = indexConfig;

  let sql = `CREATE ${unique ? 'UNIQUE ' : ''}INDEX ${ifNotExists ? 'IF NOT EXISTS ' : ''}${indexName}\n`;
  sql += `ON ${tableName} USING ${method} (${columns.join(', ')})`;

  if (where) {
    sql += `\nWHERE ${where}`;
  }

  sql += ';';

  return sql;
}

/**
 * Generate CREATE VIEW SQL statement
 * @param {Object} viewConfig - View configuration
 * @returns {string} CREATE VIEW SQL
 */
function generateCreateViewSQL(viewConfig) {
  const { viewName, query, orReplace = true } = viewConfig;

  let sql = `CREATE ${orReplace ? 'OR REPLACE ' : ''}VIEW ${viewName} AS\n`;
  sql += query;

  if (!query.trim().endsWith(';')) {
    sql += ';';
  }

  return sql;
}

/**
 * Generate CREATE FUNCTION SQL statement
 * @param {Object} functionConfig - Function configuration
 * @returns {string} CREATE FUNCTION SQL
 */
function generateCreateFunctionSQL(functionConfig) {
  const {
    functionName,
    parameters = [],
    returnType,
    language = 'plpgsql',
    body,
    orReplace = true
  } = functionConfig;

  let sql = `CREATE ${orReplace ? 'OR REPLACE ' : ''}FUNCTION ${functionName}(`;

  // Add parameters
  if (parameters.length > 0) {
    const paramDefs = parameters.map(p => `${p.name} ${p.type}${p.default ? ` DEFAULT ${p.default}` : ''}`);
    sql += paramDefs.join(', ');
  }

  sql += `)\n`;
  sql += `RETURNS ${returnType}\n`;
  sql += `LANGUAGE ${language}\n`;
  sql += `AS $$\n`;
  sql += body;

  if (!body.trim().endsWith(';')) {
    sql += '\n';
  }

  sql += `$$;`;

  return sql;
}

/**
 * Generate CREATE TRIGGER SQL statement
 * @param {Object} triggerConfig - Trigger configuration
 * @returns {string} CREATE TRIGGER SQL
 */
function generateCreateTriggerSQL(triggerConfig) {
  const {
    triggerName,
    tableName,
    timing, // BEFORE, AFTER, INSTEAD OF
    events, // INSERT, UPDATE, DELETE (array)
    forEach = 'ROW', // ROW or STATEMENT
    functionName,
    when,
    orReplace = false
  } = triggerConfig;

  let sql = `CREATE ${orReplace ? 'OR REPLACE ' : ''}TRIGGER ${triggerName}\n`;
  sql += `${timing} ${events.join(' OR ')} ON ${tableName}\n`;
  sql += `FOR EACH ${forEach}\n`;

  if (when) {
    sql += `WHEN (${when})\n`;
  }

  sql += `EXECUTE FUNCTION ${functionName}();`;

  return sql;
}

/**
 * Generate CREATE ENUM SQL statement
 * @param {Object} enumConfig - Enum configuration
 * @returns {string} CREATE TYPE SQL
 */
function generateCreateEnumSQL(enumConfig) {
  const { enumName, values, ifNotExists = true } = enumConfig;

  // PostgreSQL doesn't support IF NOT EXISTS for CREATE TYPE before v9.1
  let sql = `DO $$ BEGIN\n`;
  sql += `  CREATE TYPE ${enumName} AS ENUM (${values.map(v => `'${v}'`).join(', ')});\n`;
  sql += `EXCEPTION\n`;
  sql += `  WHEN duplicate_object THEN null;\n`;
  sql += `END $$;`;

  return sql;
}

/**
 * Create a database table
 * @param {string} database - Database name
 * @param {Object} tableConfig - Table configuration
 * @param {Object} dbConfig - Database connection configuration
 * @returns {Promise<Object>} Creation result
 */
async function createTable(database, tableConfig, dbConfig) {
  logger.info(`Creating table ${tableConfig.tableName} in database ${database}`);

  const exists = await databaseExists(database, dbConfig);
  if (!exists) {
    throw new Error(`Database ${database} does not exist`);
  }

  const sql = generateCreateTableSQL(tableConfig);
  const client = getClient({ ...dbConfig, database });

  try {
    await client.connect();
    await client.query(sql);
    await client.end();

    logger.info(`Table ${tableConfig.tableName} created successfully`);

    return {
      success: true,
      tableName: tableConfig.tableName,
      sql,
      message: 'Table created successfully'
    };
  } catch (error) {
    logger.error(`Error creating table ${tableConfig.tableName}:`, error);
    throw error;
  }
}

/**
 * Create a database index
 * @param {string} database - Database name
 * @param {Object} indexConfig - Index configuration
 * @param {Object} dbConfig - Database connection configuration
 * @returns {Promise<Object>} Creation result
 */
async function createIndex(database, indexConfig, dbConfig) {
  logger.info(`Creating index ${indexConfig.indexName} in database ${database}`);

  const sql = generateCreateIndexSQL(indexConfig);
  const client = getClient({ ...dbConfig, database });

  try {
    await client.connect();
    await client.query(sql);
    await client.end();

    logger.info(`Index ${indexConfig.indexName} created successfully`);

    return {
      success: true,
      indexName: indexConfig.indexName,
      sql,
      message: 'Index created successfully'
    };
  } catch (error) {
    logger.error(`Error creating index ${indexConfig.indexName}:`, error);
    throw error;
  }
}

/**
 * Create a database view
 * @param {string} database - Database name
 * @param {Object} viewConfig - View configuration
 * @param {Object} dbConfig - Database connection configuration
 * @returns {Promise<Object>} Creation result
 */
async function createView(database, viewConfig, dbConfig) {
  logger.info(`Creating view ${viewConfig.viewName} in database ${database}`);

  const sql = generateCreateViewSQL(viewConfig);
  const client = getClient({ ...dbConfig, database });

  try {
    await client.connect();
    await client.query(sql);
    await client.end();

    logger.info(`View ${viewConfig.viewName} created successfully`);

    return {
      success: true,
      viewName: viewConfig.viewName,
      sql,
      message: 'View created successfully'
    };
  } catch (error) {
    logger.error(`Error creating view ${viewConfig.viewName}:`, error);
    throw error;
  }
}

/**
 * Create a database function
 * @param {string} database - Database name
 * @param {Object} functionConfig - Function configuration
 * @param {Object} dbConfig - Database connection configuration
 * @returns {Promise<Object>} Creation result
 */
async function createFunction(database, functionConfig, dbConfig) {
  logger.info(`Creating function ${functionConfig.functionName} in database ${database}`);

  const sql = generateCreateFunctionSQL(functionConfig);
  const client = getClient({ ...dbConfig, database });

  try {
    await client.connect();
    await client.query(sql);
    await client.end();

    logger.info(`Function ${functionConfig.functionName} created successfully`);

    return {
      success: true,
      functionName: functionConfig.functionName,
      sql,
      message: 'Function created successfully'
    };
  } catch (error) {
    logger.error(`Error creating function ${functionConfig.functionName}:`, error);
    throw error;
  }
}

/**
 * Create a database trigger
 * @param {string} database - Database name
 * @param {Object} triggerConfig - Trigger configuration
 * @param {Object} dbConfig - Database connection configuration
 * @returns {Promise<Object>} Creation result
 */
async function createTrigger(database, triggerConfig, dbConfig) {
  logger.info(`Creating trigger ${triggerConfig.triggerName} in database ${database}`);

  const sql = generateCreateTriggerSQL(triggerConfig);
  const client = getClient({ ...dbConfig, database });

  try {
    await client.connect();
    await client.query(sql);
    await client.end();

    logger.info(`Trigger ${triggerConfig.triggerName} created successfully`);

    return {
      success: true,
      triggerName: triggerConfig.triggerName,
      sql,
      message: 'Trigger created successfully'
    };
  } catch (error) {
    logger.error(`Error creating trigger ${triggerConfig.triggerName}:`, error);
    throw error;
  }
}

/**
 * Create a database enum type
 * @param {string} database - Database name
 * @param {Object} enumConfig - Enum configuration
 * @param {Object} dbConfig - Database connection configuration
 * @returns {Promise<Object>} Creation result
 */
async function createEnum(database, enumConfig, dbConfig) {
  logger.info(`Creating enum ${enumConfig.enumName} in database ${database}`);

  const sql = generateCreateEnumSQL(enumConfig);
  const client = getClient({ ...dbConfig, database });

  try {
    await client.connect();
    await client.query(sql);
    await client.end();

    logger.info(`Enum ${enumConfig.enumName} created successfully`);

    return {
      success: true,
      enumName: enumConfig.enumName,
      sql,
      message: 'Enum created successfully'
    };
  } catch (error) {
    logger.error(`Error creating enum ${enumConfig.enumName}:`, error);
    throw error;
  }
}

/**
 * Drop a table
 * @param {string} database - Database name
 * @param {string} tableName - Table name
 * @param {Object} dbConfig - Database connection configuration
 * @param {boolean} cascade - Drop with CASCADE
 * @returns {Promise<Object>} Drop result
 */
async function dropTable(database, tableName, dbConfig, cascade = false) {
  logger.warn(`Dropping table ${tableName} from database ${database}`);

  const sql = `DROP TABLE IF EXISTS ${tableName}${cascade ? ' CASCADE' : ''};`;
  const client = getClient({ ...dbConfig, database });

  try {
    await client.connect();
    await client.query(sql);
    await client.end();

    logger.info(`Table ${tableName} dropped successfully`);

    return {
      success: true,
      tableName,
      message: 'Table dropped successfully'
    };
  } catch (error) {
    logger.error(`Error dropping table ${tableName}:`, error);
    throw error;
  }
}

/**
 * Get table schema information
 * @param {string} database - Database name
 * @param {string} tableName - Table name
 * @param {Object} dbConfig - Database connection configuration
 * @returns {Promise<Object>} Table schema
 */
async function getTableSchema(database, tableName, dbConfig) {
  const client = getClient({ ...dbConfig, database });

  try {
    await client.connect();

    // Get columns
    const columnsResult = await client.query(`
      SELECT
        column_name,
        data_type,
        character_maximum_length,
        column_default,
        is_nullable,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position
    `, [tableName]);

    // Get primary keys
    const pkResult = await client.query(`
      SELECT
        c.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage AS ccu USING (constraint_schema, constraint_name)
      JOIN information_schema.columns AS c ON c.table_schema = tc.constraint_schema
        AND tc.table_name = c.table_name AND ccu.column_name = c.column_name
      WHERE constraint_type = 'PRIMARY KEY'
        AND tc.table_name = $1
    `, [tableName]);

    // Get foreign keys
    const fkResult = await client.query(`
      SELECT
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_name = $1
    `, [tableName]);

    // Get indexes
    const indexResult = await client.query(`
      SELECT
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
    `, [tableName]);

    await client.end();

    const primaryKeys = pkResult.rows.map(row => row.column_name);
    const foreignKeys = fkResult.rows;
    const indexes = indexResult.rows;

    return {
      success: true,
      tableName,
      columns: columnsResult.rows,
      primaryKeys,
      foreignKeys,
      indexes
    };
  } catch (error) {
    logger.error(`Error getting table schema for ${tableName}:`, error);
    throw error;
  }
}

/**
 * List all tables in database
 * @param {string} database - Database name
 * @param {Object} dbConfig - Database connection configuration
 * @returns {Promise<Array>} List of tables
 */
async function listTables(database, dbConfig) {
  const client = getClient({ ...dbConfig, database });

  try {
    await client.connect();

    const result = await client.query(`
      SELECT
        table_name,
        (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    await client.end();

    return result.rows;
  } catch (error) {
    logger.error(`Error listing tables in ${database}:`, error);
    throw error;
  }
}

/**
 * Get available PostgreSQL types
 * @returns {Object} PostgreSQL types
 */
function getPostgresTypes() {
  return POSTGRES_TYPES;
}

module.exports = {
  createTable,
  createIndex,
  createView,
  createFunction,
  createTrigger,
  createEnum,
  dropTable,
  getTableSchema,
  listTables,
  getPostgresTypes,
  generateCreateTableSQL,
  generateCreateIndexSQL,
  generateCreateViewSQL,
  generateCreateFunctionSQL,
  generateCreateTriggerSQL,
  generateCreateEnumSQL,
  POSTGRES_TYPES,
  CONSTRAINTS
};
