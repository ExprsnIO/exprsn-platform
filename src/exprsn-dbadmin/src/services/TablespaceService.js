const connectionPoolManager = require('./ConnectionPoolManager');
const { logger } = require('@exprsn/shared');
const pgFormat = require('pg-format');

/**
 * Service for managing PostgreSQL tablespaces
 */
class TablespaceService {
  /**
   * List all tablespaces
   */
  async listTablespaces(connectionConfig) {
    const query = `
      SELECT
        ts.spcname as name,
        pg_catalog.pg_get_userbyid(ts.spcowner) as owner,
        pg_catalog.pg_tablespace_location(ts.oid) as location,
        ts.spcacl as acl,
        pg_catalog.pg_tablespace_size(ts.spcname) as size_bytes,
        pg_catalog.pg_size_pretty(pg_catalog.pg_tablespace_size(ts.spcname)) as size,
        ts.spcoptions as options,
        pg_catalog.obj_description(ts.oid, 'pg_tablespace') as description
      FROM pg_catalog.pg_tablespace ts
      ORDER BY ts.spcname
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query);
    return result.rows;
  }

  /**
   * Get tablespace details
   */
  async getTablespace(connectionConfig, tablespaceName) {
    const query = `
      SELECT
        ts.spcname as name,
        pg_catalog.pg_get_userbyid(ts.spcowner) as owner,
        pg_catalog.pg_tablespace_location(ts.oid) as location,
        ts.spcacl as acl,
        pg_catalog.pg_tablespace_size(ts.spcname) as size_bytes,
        pg_catalog.pg_size_pretty(pg_catalog.pg_tablespace_size(ts.spcname)) as size,
        ts.spcoptions as options,
        pg_catalog.obj_description(ts.oid, 'pg_tablespace') as description
      FROM pg_catalog.pg_tablespace ts
      WHERE ts.spcname = $1
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [tablespaceName]);
    return result.rows[0] || null;
  }

  /**
   * Create a new tablespace
   */
  async createTablespace(connectionConfig, name, location, owner = null, options = {}) {
    let sql = pgFormat('CREATE TABLESPACE %I LOCATION %L', name, location);

    if (owner) {
      sql += pgFormat(' OWNER %I', owner);
    }

    if (options && Object.keys(options).length > 0) {
      const opts = Object.entries(options)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      sql += ` WITH (${opts})`;
    }

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Tablespace created', { name, location, owner });
    return { success: true, message: `Tablespace '${name}' created successfully` };
  }

  /**
   * Alter tablespace
   */
  async alterTablespace(connectionConfig, name, changes) {
    const queries = [];

    if (changes.rename) {
      queries.push(pgFormat('ALTER TABLESPACE %I RENAME TO %I', name, changes.rename));
      name = changes.rename; // Update name for subsequent queries
    }

    if (changes.owner) {
      queries.push(pgFormat('ALTER TABLESPACE %I OWNER TO %I', name, changes.owner));
    }

    if (changes.options) {
      const opts = Object.entries(changes.options)
        .map(([key, value]) => `${key}=${value}`)
        .join(', ');
      queries.push(pgFormat('ALTER TABLESPACE %I SET (%s)', name, opts));
    }

    for (const query of queries) {
      await connectionPoolManager.executeQuery(connectionConfig, query);
    }

    logger.info('Tablespace altered', { name, changes });
    return { success: true, message: `Tablespace '${name}' altered successfully` };
  }

  /**
   * Drop a tablespace
   */
  async dropTablespace(connectionConfig, name, cascade = false) {
    const sql = cascade
      ? pgFormat('DROP TABLESPACE %I CASCADE', name)
      : pgFormat('DROP TABLESPACE %I', name);

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Tablespace dropped', { name, cascade });
    return { success: true, message: `Tablespace '${name}' dropped successfully` };
  }

  /**
   * List objects in a tablespace
   */
  async getTablespaceObjects(connectionConfig, tablespaceName) {
    const query = `
      SELECT
        n.nspname as schema,
        c.relname as name,
        CASE c.relkind
          WHEN 'r' THEN 'table'
          WHEN 'i' THEN 'index'
          WHEN 'S' THEN 'sequence'
          WHEN 't' THEN 'toast'
          WHEN 'v' THEN 'view'
          WHEN 'm' THEN 'materialized view'
        END as type,
        pg_catalog.pg_get_userbyid(c.relowner) as owner,
        pg_catalog.pg_size_pretty(pg_catalog.pg_table_size(c.oid)) as size
      FROM pg_catalog.pg_class c
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_catalog.pg_tablespace t ON t.oid = c.reltablespace
      WHERE COALESCE(t.spcname, 'pg_default') = $1
      ORDER BY n.nspname, c.relname
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [tablespaceName]);
    return result.rows;
  }
}

module.exports = new TablespaceService();
