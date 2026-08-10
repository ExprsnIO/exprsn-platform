const connectionPoolManager = require('./ConnectionPoolManager');
const { logger } = require('@exprsn/shared');
const { parse } = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const pgFormat = require('pg-format');
const fs = require('fs').promises;

/**
 * Service for importing and exporting data in various formats
 */
class ImportExportService {
  /**
   * Export table data to CSV
   */
  async exportToCSV(connectionConfig, schemaName, tableName, options = {}) {
    const {
      delimiter = ',',
      header = true,
      where = null,
      orderBy = null,
      limit = null
    } = options;

    // Build query
    let query = pgFormat('SELECT * FROM %I.%I', schemaName, tableName);

    if (where) {
      query += ` WHERE ${where}`;
    }

    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const result = await connectionPoolManager.executeQuery(connectionConfig, query);

    // Convert to CSV
    const csv = stringify(result.rows, {
      header,
      delimiter,
      quoted: true,
      quoted_empty: true
    });

    logger.info('Data exported to CSV', {
      schema: schemaName,
      table: tableName,
      rowCount: result.rows.length
    });

    return {
      data: csv,
      rowCount: result.rows.length,
      format: 'csv'
    };
  }

  /**
   * Export table data to TSV (Tab-Separated Values)
   */
  async exportToTSV(connectionConfig, schemaName, tableName, options = {}) {
    return this.exportToCSV(connectionConfig, schemaName, tableName, {
      ...options,
      delimiter: '\t'
    });
  }

  /**
   * Export table data to JSON
   */
  async exportToJSON(connectionConfig, schemaName, tableName, options = {}) {
    const {
      where = null,
      orderBy = null,
      limit = null,
      pretty = true
    } = options;

    // Build query
    let query = pgFormat('SELECT * FROM %I.%I', schemaName, tableName);

    if (where) {
      query += ` WHERE ${where}`;
    }

    if (orderBy) {
      query += ` ORDER BY ${orderBy}`;
    }

    if (limit) {
      query += ` LIMIT ${limit}`;
    }

    const result = await connectionPoolManager.executeQuery(connectionConfig, query);

    const json = pretty
      ? JSON.stringify(result.rows, null, 2)
      : JSON.stringify(result.rows);

    logger.info('Data exported to JSON', {
      schema: schemaName,
      table: tableName,
      rowCount: result.rows.length
    });

    return {
      data: json,
      rowCount: result.rows.length,
      format: 'json'
    };
  }

  /**
   * Export table structure and data to SQL INSERT statements
   */
  async exportToSQL(connectionConfig, schemaName, tableName, options = {}) {
    const {
      includeSchema = true,
      includeData = true,
      where = null,
      limit = null
    } = options;

    let sql = '';

    // Export table structure
    if (includeSchema) {
      const schemaQuery = `
        SELECT
          'CREATE TABLE ' || quote_ident($1) || '.' || quote_ident($2) || E' (\n' ||
          string_agg(
            '  ' || quote_ident(column_name) || ' ' ||
            CASE
              WHEN domain_name IS NOT NULL THEN domain_name
              ELSE data_type ||
                CASE
                  WHEN character_maximum_length IS NOT NULL
                    THEN '(' || character_maximum_length || ')'
                  WHEN numeric_precision IS NOT NULL
                    THEN '(' || numeric_precision || ',' || numeric_scale || ')'
                  ELSE ''
                END
            END ||
            CASE WHEN is_nullable = 'NO' THEN ' NOT NULL' ELSE '' END ||
            CASE WHEN column_default IS NOT NULL THEN ' DEFAULT ' || column_default ELSE '' END,
            E',\n'
            ORDER BY ordinal_position
          ) ||
          E'\n);'
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
      `;

      const schemaResult = await connectionPoolManager.executeQuery(
        connectionConfig,
        schemaQuery,
        [schemaName, tableName]
      );

      sql += schemaResult.rows[0]['?column?'] + '\n\n';
    }

    // Export data as INSERT statements
    if (includeData) {
      let dataQuery = pgFormat('SELECT * FROM %I.%I', schemaName, tableName);

      if (where) {
        dataQuery += ` WHERE ${where}`;
      }

      if (limit) {
        dataQuery += ` LIMIT ${limit}`;
      }

      const dataResult = await connectionPoolManager.executeQuery(connectionConfig, dataQuery);

      if (dataResult.rows.length > 0) {
        const columns = Object.keys(dataResult.rows[0]);

        for (const row of dataResult.rows) {
          const values = columns.map(col => {
            const value = row[col];
            if (value === null) return 'NULL';
            if (typeof value === 'number') return value;
            if (typeof value === 'boolean') return value;
            if (typeof value === 'object') return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
            return `'${String(value).replace(/'/g, "''")}'`;
          });

          sql += pgFormat(
            'INSERT INTO %I.%I (%s) VALUES (%s);\n',
            schemaName,
            tableName,
            columns.map(c => pgFormat('%I', c)).join(', '),
            values.join(', ')
          );
        }
      }
    }

    logger.info('Data exported to SQL', {
      schema: schemaName,
      table: tableName,
      includeSchema,
      includeData
    });

    return {
      data: sql,
      format: 'sql'
    };
  }

  /**
   * Import data from CSV
   */
  async importFromCSV(connectionConfig, schemaName, tableName, csvData, options = {}) {
    const {
      delimiter = ',',
      hasHeader = true,
      truncate = false,
      batchSize = 1000
    } = options;

    // Parse CSV
    const records = parse(csvData, {
      delimiter,
      columns: hasHeader,
      skip_empty_lines: true,
      trim: true
    });

    if (records.length === 0) {
      return { success: true, inserted: 0, message: 'No data to import' };
    }

    // Truncate table if requested
    if (truncate) {
      await connectionPoolManager.executeQuery(
        connectionConfig,
        pgFormat('TRUNCATE TABLE %I.%I', schemaName, tableName)
      );
    }

    // Insert data in batches
    const columns = Object.keys(records[0]);
    let inserted = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const values = batch.map(record =>
        columns.map(col => record[col] === '' ? null : record[col])
      );

      const placeholders = values.map((_, idx) => {
        const offset = idx * columns.length;
        return `(${columns.map((_, colIdx) => `$${offset + colIdx + 1}`).join(', ')})`;
      }).join(', ');

      const flatValues = values.flat();

      const insertQuery = pgFormat(
        'INSERT INTO %I.%I (%s) VALUES %s',
        schemaName,
        tableName,
        columns.map(c => pgFormat('%I', c)).join(', '),
        placeholders
      );

      const result = await connectionPoolManager.executeQuery(connectionConfig, insertQuery, flatValues);
      inserted += result.rowCount;
    }

    logger.info('Data imported from CSV', {
      schema: schemaName,
      table: tableName,
      inserted
    });

    return {
      success: true,
      inserted,
      message: `Successfully imported ${inserted} rows`
    };
  }

  /**
   * Import data from TSV
   */
  async importFromTSV(connectionConfig, schemaName, tableName, tsvData, options = {}) {
    return this.importFromCSV(connectionConfig, schemaName, tableName, tsvData, {
      ...options,
      delimiter: '\t'
    });
  }

  /**
   * Import data from JSON
   */
  async importFromJSON(connectionConfig, schemaName, tableName, jsonData, options = {}) {
    const {
      truncate = false,
      batchSize = 1000
    } = options;

    // Parse JSON
    const records = Array.isArray(jsonData) ? jsonData : JSON.parse(jsonData);

    if (records.length === 0) {
      return { success: true, inserted: 0, message: 'No data to import' };
    }

    // Truncate table if requested
    if (truncate) {
      await connectionPoolManager.executeQuery(
        connectionConfig,
        pgFormat('TRUNCATE TABLE %I.%I', schemaName, tableName)
      );
    }

    // Insert data in batches
    const columns = Object.keys(records[0]);
    let inserted = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const values = batch.map(record =>
        columns.map(col => record[col] === undefined ? null : record[col])
      );

      const placeholders = values.map((_, idx) => {
        const offset = idx * columns.length;
        return `(${columns.map((_, colIdx) => `$${offset + colIdx + 1}`).join(', ')})`;
      }).join(', ');

      const flatValues = values.flat();

      const insertQuery = pgFormat(
        'INSERT INTO %I.%I (%s) VALUES %s',
        schemaName,
        tableName,
        columns.map(c => pgFormat('%I', c)).join(', '),
        placeholders
      );

      const result = await connectionPoolManager.executeQuery(connectionConfig, insertQuery, flatValues);
      inserted += result.rowCount;
    }

    logger.info('Data imported from JSON', {
      schema: schemaName,
      table: tableName,
      inserted
    });

    return {
      success: true,
      inserted,
      message: `Successfully imported ${inserted} rows`
    };
  }

  /**
   * Import data from SQL file
   */
  async importFromSQL(connectionConfig, sqlData) {
    // Split SQL into individual statements
    const statements = sqlData
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    let executed = 0;
    const results = [];

    for (const statement of statements) {
      try {
        const result = await connectionPoolManager.executeQuery(connectionConfig, statement);
        executed++;
        results.push({
          success: true,
          statement: statement.substring(0, 100),
          rowCount: result.rowCount
        });
      } catch (error) {
        results.push({
          success: false,
          statement: statement.substring(0, 100),
          error: error.message
        });
      }
    }

    logger.info('SQL imported', {
      total: statements.length,
      executed
    });

    return {
      success: true,
      total: statements.length,
      executed,
      failed: statements.length - executed,
      results
    };
  }

  /**
   * Export database schema to SQL
   */
  async exportDatabaseSchema(connectionConfig, schemaName) {
    const query = `
      SELECT
        'CREATE SCHEMA IF NOT EXISTS ' || quote_ident($1) || ';' ||
        E'\n\n' ||
        string_agg(
          pg_get_functiondef(p.oid),
          E'\n\n'
        ) as schema_dump
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName]);

    return {
      data: result.rows[0]?.schema_dump || `CREATE SCHEMA IF NOT EXISTS ${schemaName};`,
      format: 'sql'
    };
  }
}

module.exports = new ImportExportService();
