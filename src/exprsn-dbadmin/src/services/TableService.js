const connectionPoolManager = require('./ConnectionPoolManager');
const { logger } = require('@exprsn/shared');
const pgFormat = require('pg-format');

/**
 * Service for managing PostgreSQL tables
 */
class TableService {
  /**
   * List all tables in a schema
   */
  async listTables(connectionConfig, schemaName = 'public') {
    const query = `
      SELECT
        t.table_schema as schema,
        t.table_name as name,
        pg_catalog.obj_description(
          (quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))::regclass::oid,
          'pg_class'
        ) as description,
        pg_catalog.pg_get_userbyid(c.relowner) as owner,
        pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(
          (quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))::regclass
        )) as total_size,
        pg_catalog.pg_size_pretty(pg_catalog.pg_table_size(
          (quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))::regclass
        )) as table_size,
        (SELECT count(*) FROM information_schema.columns
         WHERE table_schema = t.table_schema AND table_name = t.table_name) as column_count,
        s.n_live_tup as row_count_estimate,
        s.n_tup_ins as inserts,
        s.n_tup_upd as updates,
        s.n_tup_del as deletes,
        s.last_vacuum,
        s.last_autovacuum,
        s.last_analyze,
        s.last_autoanalyze
      FROM information_schema.tables t
      LEFT JOIN pg_catalog.pg_class c ON c.relname = t.table_name
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
      LEFT JOIN pg_catalog.pg_stat_user_tables s ON s.schemaname = t.table_schema AND s.relname = t.table_name
      WHERE t.table_schema = $1
        AND t.table_type = 'BASE TABLE'
      ORDER BY t.table_name
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName]);
    return result.rows;
  }

  /**
   * Get table details including columns, indexes, constraints
   */
  async getTableDetails(connectionConfig, schemaName, tableName) {
    const queries = {
      table: `
        SELECT
          t.table_schema as schema,
          t.table_name as name,
          pg_catalog.obj_description(
            (quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))::regclass::oid,
            'pg_class'
          ) as description,
          pg_catalog.pg_get_userbyid(c.relowner) as owner,
          pg_catalog.pg_size_pretty(pg_catalog.pg_total_relation_size(
            (quote_ident(t.table_schema)||'.'||quote_ident(t.table_name))::regclass
          )) as total_size,
          c.reltuples::bigint as row_count_estimate
        FROM information_schema.tables t
        JOIN pg_catalog.pg_class c ON c.relname = t.table_name
        JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace AND n.nspname = t.table_schema
        WHERE t.table_schema = $1 AND t.table_name = $2
      `,
      columns: `
        SELECT
          column_name as name,
          ordinal_position as position,
          column_default as default_value,
          is_nullable = 'YES' as nullable,
          data_type,
          character_maximum_length,
          numeric_precision,
          numeric_scale,
          udt_name,
          col_description(
            (quote_ident($1)||'.'||quote_ident($2))::regclass::oid,
            ordinal_position
          ) as description
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $2
        ORDER BY ordinal_position
      `,
      indexes: `
        SELECT
          i.indexname as name,
          i.indexdef as definition,
          idx.indisunique as is_unique,
          idx.indisprimary as is_primary,
          pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(
            (quote_ident(i.schemaname)||'.'||quote_ident(i.indexname))::regclass
          )) as size,
          obj_description(
            (quote_ident(i.schemaname)||'.'||quote_ident(i.indexname))::regclass::oid,
            'pg_class'
          ) as description
        FROM pg_catalog.pg_indexes i
        JOIN pg_catalog.pg_class c ON c.relname = i.indexname
        JOIN pg_catalog.pg_index idx ON idx.indexrelid = c.oid
        WHERE i.schemaname = $1 AND i.tablename = $2
        ORDER BY i.indexname
      `,
      constraints: `
        SELECT
          tc.constraint_name as name,
          tc.constraint_type as type,
          kcu.column_name,
          ccu.table_schema as foreign_table_schema,
          ccu.table_name as foreign_table_name,
          ccu.column_name as foreign_column_name,
          rc.update_rule,
          rc.delete_rule,
          cc.check_clause
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON ccu.constraint_name = tc.constraint_name
          AND ccu.table_schema = tc.table_schema
        LEFT JOIN information_schema.referential_constraints rc
          ON rc.constraint_name = tc.constraint_name
          AND rc.constraint_schema = tc.table_schema
        LEFT JOIN information_schema.check_constraints cc
          ON cc.constraint_name = tc.constraint_name
          AND cc.constraint_schema = tc.table_schema
        WHERE tc.table_schema = $1 AND tc.table_name = $2
        ORDER BY tc.constraint_type, tc.constraint_name
      `,
      triggers: `
        SELECT
          trigger_name as name,
          event_manipulation as event,
          action_timing as timing,
          action_statement as action,
          action_orientation as orientation
        FROM information_schema.triggers
        WHERE event_object_schema = $1 AND event_object_table = $2
        ORDER BY trigger_name
      `
    };

    const [table, columns, indexes, constraints, triggers] = await Promise.all([
      connectionPoolManager.executeQuery(connectionConfig, queries.table, [schemaName, tableName]),
      connectionPoolManager.executeQuery(connectionConfig, queries.columns, [schemaName, tableName]),
      connectionPoolManager.executeQuery(connectionConfig, queries.indexes, [schemaName, tableName]),
      connectionPoolManager.executeQuery(connectionConfig, queries.constraints, [schemaName, tableName]),
      connectionPoolManager.executeQuery(connectionConfig, queries.triggers, [schemaName, tableName])
    ]);

    return {
      table: table.rows[0],
      columns: columns.rows,
      indexes: indexes.rows,
      constraints: constraints.rows,
      triggers: triggers.rows
    };
  }

  /**
   * Get table data with pagination
   */
  async getTableData(connectionConfig, schemaName, tableName, options = {}) {
    const {
      limit = 100,
      offset = 0,
      orderBy = null,
      orderDir = 'ASC',
      where = null
    } = options;

    let sql = pgFormat('SELECT * FROM %I.%I', schemaName, tableName);

    if (where) {
      sql += ` WHERE ${where}`;
    }

    if (orderBy) {
      sql += pgFormat(' ORDER BY %I %s', orderBy, orderDir.toUpperCase());
    }

    sql += pgFormat(' LIMIT %s OFFSET %s', limit, offset);

    const countSql = pgFormat('SELECT COUNT(*) as total FROM %I.%I', schemaName, tableName);
    const countWithWhere = where ? `${countSql} WHERE ${where}` : countSql;

    const [data, count] = await Promise.all([
      connectionPoolManager.executeQuery(connectionConfig, sql),
      connectionPoolManager.executeQuery(connectionConfig, countWithWhere)
    ]);

    return {
      rows: data.rows,
      total: parseInt(count.rows[0].total),
      limit,
      offset,
      hasMore: offset + limit < parseInt(count.rows[0].total)
    };
  }

  /**
   * Create a new table
   */
  async createTable(connectionConfig, schemaName, tableName, columns, options = {}) {
    const columnDefs = columns.map(col => {
      let def = pgFormat('%I %s', col.name, col.dataType);

      if (col.notNull) def += ' NOT NULL';
      if (col.unique) def += ' UNIQUE';
      if (col.primaryKey) def += ' PRIMARY KEY';
      if (col.default !== undefined) def += ` DEFAULT ${col.default}`;

      return def;
    }).join(', ');

    let sql = pgFormat('CREATE TABLE %I.%I (%s)', schemaName, tableName, columnDefs);

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Table created', { schema: schemaName, table: tableName });
    return { success: true, message: `Table '${schemaName}.${tableName}' created successfully` };
  }

  /**
   * Alter table structure
   */
  async alterTable(connectionConfig, schemaName, tableName, alterations) {
    const queries = [];

    for (const alter of alterations) {
      let sql = pgFormat('ALTER TABLE %I.%I', schemaName, tableName);

      switch (alter.type) {
        case 'ADD_COLUMN':
          sql += pgFormat(' ADD COLUMN %I %s', alter.columnName, alter.dataType);
          if (alter.notNull) sql += ' NOT NULL';
          if (alter.default) sql += ` DEFAULT ${alter.default}`;
          break;

        case 'DROP_COLUMN':
          sql += pgFormat(' DROP COLUMN %I', alter.columnName);
          if (alter.cascade) sql += ' CASCADE';
          break;

        case 'RENAME_COLUMN':
          sql += pgFormat(' RENAME COLUMN %I TO %I', alter.oldName, alter.newName);
          break;

        case 'ALTER_COLUMN_TYPE':
          sql += pgFormat(' ALTER COLUMN %I TYPE %s', alter.columnName, alter.dataType);
          break;

        case 'SET_NOT_NULL':
          sql += pgFormat(' ALTER COLUMN %I SET NOT NULL', alter.columnName);
          break;

        case 'DROP_NOT_NULL':
          sql += pgFormat(' ALTER COLUMN %I DROP NOT NULL', alter.columnName);
          break;

        case 'SET_DEFAULT':
          sql += pgFormat(' ALTER COLUMN %I SET DEFAULT %s', alter.columnName, alter.default);
          break;

        case 'DROP_DEFAULT':
          sql += pgFormat(' ALTER COLUMN %I DROP DEFAULT', alter.columnName);
          break;

        case 'ADD_CONSTRAINT':
          sql += pgFormat(' ADD CONSTRAINT %I %s', alter.constraintName, alter.definition);
          break;

        case 'DROP_CONSTRAINT':
          sql += pgFormat(' DROP CONSTRAINT %I', alter.constraintName);
          if (alter.cascade) sql += ' CASCADE';
          break;

        case 'RENAME_TABLE':
          sql = pgFormat('ALTER TABLE %I.%I RENAME TO %I', schemaName, tableName, alter.newName);
          tableName = alter.newName;
          break;

        default:
          throw new Error(`Unknown alteration type: ${alter.type}`);
      }

      queries.push(sql);
    }

    for (const query of queries) {
      await connectionPoolManager.executeQuery(connectionConfig, query);
    }

    logger.info('Table altered', { schema: schemaName, table: tableName, alterations });
    return { success: true, message: `Table '${schemaName}.${tableName}' altered successfully` };
  }

  /**
   * Drop a table
   */
  async dropTable(connectionConfig, schemaName, tableName, cascade = false) {
    const sql = cascade
      ? pgFormat('DROP TABLE %I.%I CASCADE', schemaName, tableName)
      : pgFormat('DROP TABLE %I.%I', schemaName, tableName);

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Table dropped', { schema: schemaName, table: tableName, cascade });
    return { success: true, message: `Table '${schemaName}.${tableName}' dropped successfully` };
  }

  /**
   * Truncate a table
   */
  async truncateTable(connectionConfig, schemaName, tableName, cascade = false, restartIdentity = false) {
    let sql = pgFormat('TRUNCATE TABLE %I.%I', schemaName, tableName);

    if (restartIdentity) sql += ' RESTART IDENTITY';
    if (cascade) sql += ' CASCADE';

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Table truncated', { schema: schemaName, table: tableName });
    return { success: true, message: `Table '${schemaName}.${tableName}' truncated successfully` };
  }

  /**
   * Insert row into table
   */
  async insertRow(connectionConfig, schemaName, tableName, data) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`).join(', ');

    const sql = pgFormat(
      'INSERT INTO %I.%I (%s) VALUES (%s) RETURNING *',
      schemaName,
      tableName,
      columns.map(c => pgFormat('%I', c)).join(', '),
      placeholders
    );

    const result = await connectionPoolManager.executeQuery(connectionConfig, sql, values);
    return result.rows[0];
  }

  /**
   * Update row in table
   */
  async updateRow(connectionConfig, schemaName, tableName, data, whereClause, whereParams = []) {
    const setClauses = Object.keys(data).map((key, i) =>
      pgFormat('%I = $%s', key, i + 1)
    ).join(', ');

    const sql = pgFormat(
      'UPDATE %I.%I SET %s WHERE %s RETURNING *',
      schemaName,
      tableName,
      setClauses,
      whereClause
    );

    const params = [...Object.values(data), ...whereParams];
    const result = await connectionPoolManager.executeQuery(connectionConfig, sql, params);
    return result.rows[0];
  }

  /**
   * Delete row from table
   */
  async deleteRow(connectionConfig, schemaName, tableName, whereClause, whereParams = []) {
    const sql = pgFormat(
      'DELETE FROM %I.%I WHERE %s RETURNING *',
      schemaName,
      tableName,
      whereClause
    );

    const result = await connectionPoolManager.executeQuery(connectionConfig, sql, whereParams);
    return result.rows[0];
  }

  /**
   * Vacuum table
   */
  async vacuumTable(connectionConfig, schemaName, tableName, full = false, analyze = true) {
    let sql = 'VACUUM';
    if (full) sql += ' FULL';
    if (analyze) sql += ' ANALYZE';
    sql += pgFormat(' %I.%I', schemaName, tableName);

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Table vacuumed', { schema: schemaName, table: tableName, full, analyze });
    return { success: true, message: `Table '${schemaName}.${tableName}' vacuumed successfully` };
  }
}

module.exports = new TableService();
