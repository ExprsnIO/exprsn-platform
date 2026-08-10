const connectionPoolManager = require('./ConnectionPoolManager');
const { logger } = require('@exprsn/shared');
const pgFormat = require('pg-format');

/**
 * Core PostgreSQL service for database introspection and management
 */
class PostgreSQLService {
  /**
   * Get PostgreSQL server version and details
   */
  async getServerInfo(connectionConfig) {
    const query = `
      SELECT
        version() as version,
        current_database() as current_database,
        current_user as current_user,
        inet_server_addr() as server_addr,
        inet_server_port() as server_port,
        pg_postmaster_start_time() as start_time,
        pg_conf_load_time() as config_load_time
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query);
    return result.rows[0];
  }

  /**
   * List all databases
   */
  async listDatabases(connectionConfig) {
    const query = `
      SELECT
        d.datname as name,
        pg_catalog.pg_get_userbyid(d.datdba) as owner,
        pg_catalog.pg_encoding_to_char(d.encoding) as encoding,
        d.datcollate as collation,
        d.datctype as ctype,
        d.datistemplate as is_template,
        d.datallowconn as allow_connections,
        d.datconnlimit as connection_limit,
        pg_catalog.pg_database_size(d.datname) as size_bytes,
        pg_catalog.pg_size_pretty(pg_catalog.pg_database_size(d.datname)) as size,
        d.datacl as acl
      FROM pg_catalog.pg_database d
      WHERE d.datistemplate = false
      ORDER BY d.datname
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query);
    return result.rows;
  }

  /**
   * List all schemas in the current database
   */
  async listSchemas(connectionConfig) {
    const query = `
      SELECT
        n.nspname as name,
        pg_catalog.pg_get_userbyid(n.nspowner) as owner,
        n.nspacl as acl,
        pg_catalog.obj_description(n.oid, 'pg_namespace') as description
      FROM pg_catalog.pg_namespace n
      WHERE n.nspname !~ '^pg_'
        AND n.nspname <> 'information_schema'
      ORDER BY n.nspname
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query);
    return result.rows;
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(connectionConfig) {
    const query = `
      SELECT
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()) as active_connections,
        (SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND state = 'active') as active_queries,
        (SELECT count(*) FROM pg_tables WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as table_count,
        (SELECT count(*) FROM pg_views WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as view_count,
        (SELECT count(*) FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog', 'information_schema')) as index_count,
        (SELECT sum(n_tup_ins) FROM pg_stat_user_tables) as total_inserts,
        (SELECT sum(n_tup_upd) FROM pg_stat_user_tables) as total_updates,
        (SELECT sum(n_tup_del) FROM pg_stat_user_tables) as total_deletes,
        pg_database_size(current_database()) as db_size_bytes,
        pg_size_pretty(pg_database_size(current_database())) as db_size
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query);
    return result.rows[0];
  }

  /**
   * Get active connections/sessions
   */
  async getActiveSessions(connectionConfig) {
    const query = `
      SELECT
        pid,
        usename as username,
        application_name,
        client_addr as client_address,
        client_port,
        backend_start,
        state,
        state_change,
        query_start,
        query,
        wait_event_type,
        wait_event
      FROM pg_stat_activity
      WHERE datname = current_database()
      ORDER BY backend_start DESC
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query);
    return result.rows;
  }

  /**
   * Kill a session by PID
   */
  async killSession(connectionConfig, pid) {
    const query = `SELECT pg_terminate_backend($1) as terminated`;
    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [pid]);
    return result.rows[0];
  }

  /**
   * Execute raw SQL query
   */
  async executeRawQuery(connectionConfig, sql, params = []) {
    return await connectionPoolManager.executeQuery(connectionConfig, sql, params);
  }

  /**
   * Explain query execution plan
   */
  async explainQuery(connectionConfig, sql, analyze = false) {
    const explainSql = analyze
      ? `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${sql}`
      : `EXPLAIN (FORMAT JSON) ${sql}`;

    const result = await connectionPoolManager.executeQuery(connectionConfig, explainSql);
    return result.rows[0]['QUERY PLAN'];
  }
}

module.exports = new PostgreSQLService();
