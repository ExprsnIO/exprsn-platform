const connectionPoolManager = require('./ConnectionPoolManager');
const { logger } = require('@exprsn/shared');
const pgFormat = require('pg-format');

/**
 * Service for managing PostgreSQL functions and stored procedures
 */
class FunctionService {
  /**
   * List all functions in a schema
   */
  async listFunctions(connectionConfig, schemaName = 'public') {
    const query = `
      SELECT
        p.proname as name,
        n.nspname as schema,
        pg_catalog.pg_get_userbyid(p.proowner) as owner,
        l.lanname as language,
        CASE p.prokind
          WHEN 'f' THEN 'function'
          WHEN 'p' THEN 'procedure'
          WHEN 'a' THEN 'aggregate'
          WHEN 'w' THEN 'window'
        END as kind,
        pg_catalog.pg_get_function_arguments(p.oid) as arguments,
        pg_catalog.pg_get_function_result(p.oid) as return_type,
        p.provolatile as volatility,
        p.proisstrict as is_strict,
        p.prosecdef as security_definer,
        p.proleakproof as is_leakproof,
        p.procost as cost,
        p.prorows as estimated_rows,
        pg_catalog.obj_description(p.oid, 'pg_proc') as description
      FROM pg_catalog.pg_proc p
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE n.nspname = $1
        AND p.prokind IN ('f', 'p')
      ORDER BY p.proname
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName]);
    return result.rows;
  }

  /**
   * Get function source code and details
   */
  async getFunction(connectionConfig, schemaName, functionName, argumentTypes = []) {
    // Build function signature for lookup
    const signature = argumentTypes.length > 0
      ? `${schemaName}.${functionName}(${argumentTypes.join(', ')})`
      : `${schemaName}.${functionName}`;

    const query = `
      SELECT
        p.proname as name,
        n.nspname as schema,
        pg_catalog.pg_get_userbyid(p.proowner) as owner,
        l.lanname as language,
        CASE p.prokind
          WHEN 'f' THEN 'function'
          WHEN 'p' THEN 'procedure'
          WHEN 'a' THEN 'aggregate'
          WHEN 'w' THEN 'window'
        END as kind,
        pg_catalog.pg_get_functiondef(p.oid) as definition,
        pg_catalog.pg_get_function_arguments(p.oid) as arguments,
        pg_catalog.pg_get_function_result(p.oid) as return_type,
        p.prosrc as source_code,
        CASE p.provolatile
          WHEN 'i' THEN 'IMMUTABLE'
          WHEN 's' THEN 'STABLE'
          WHEN 'v' THEN 'VOLATILE'
        END as volatility,
        p.proisstrict as is_strict,
        p.prosecdef as security_definer,
        p.proleakproof as is_leakproof,
        p.procost as cost,
        p.prorows as estimated_rows,
        p.proconfig as config,
        pg_catalog.obj_description(p.oid, 'pg_proc') as description
      FROM pg_catalog.pg_proc p
      LEFT JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      LEFT JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE n.nspname = $1 AND p.proname = $2
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName, functionName]);
    return result.rows[0] || null;
  }

  /**
   * Create or replace a function
   */
  async createOrReplaceFunction(connectionConfig, definition) {
    // The definition should be a complete CREATE OR REPLACE FUNCTION/PROCEDURE statement
    await connectionPoolManager.executeQuery(connectionConfig, definition);

    logger.info('Function created/replaced', { definition: definition.substring(0, 100) });
    return { success: true, message: 'Function created/replaced successfully' };
  }

  /**
   * Drop a function
   */
  async dropFunction(connectionConfig, schemaName, functionName, argumentTypes = [], cascade = false, ifExists = true) {
    const args = argumentTypes.length > 0 ? `(${argumentTypes.join(', ')})` : '()';
    const ifExistsClause = ifExists ? 'IF EXISTS' : '';
    const cascadeClause = cascade ? 'CASCADE' : '';

    const sql = pgFormat(
      'DROP FUNCTION %s %I.%I%s %s',
      ifExistsClause,
      schemaName,
      functionName,
      args,
      cascadeClause
    );

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Function dropped', { schema: schemaName, name: functionName });
    return { success: true, message: `Function '${schemaName}.${functionName}' dropped successfully` };
  }

  /**
   * Execute a function
   */
  async executeFunction(connectionConfig, schemaName, functionName, parameters = []) {
    const placeholders = parameters.map((_, i) => `$${i + 1}`).join(', ');
    const sql = pgFormat('SELECT * FROM %I.%I(%s)', schemaName, functionName, placeholders);

    const result = await connectionPoolManager.executeQuery(connectionConfig, sql, parameters);
    return result.rows;
  }

  /**
   * Get function dependencies
   */
  async getFunctionDependencies(connectionConfig, schemaName, functionName) {
    const query = `
      SELECT
        DISTINCT
        d.refobjid::regclass AS depends_on,
        CASE d.deptype
          WHEN 'n' THEN 'normal'
          WHEN 'a' THEN 'auto'
          WHEN 'i' THEN 'internal'
          WHEN 'e' THEN 'extension'
          WHEN 'p' THEN 'pin'
        END as dependency_type
      FROM pg_catalog.pg_depend d
      JOIN pg_catalog.pg_proc p ON d.objid = p.oid
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = $1 AND p.proname = $2
        AND d.deptype IN ('n', 'a')
        AND d.refobjid != 0
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName, functionName]);
    return result.rows;
  }

  /**
   * Get function usage statistics
   */
  async getFunctionStats(connectionConfig, schemaName, functionName) {
    const query = `
      SELECT
        funcid::regproc as function,
        calls,
        total_time,
        self_time,
        total_time / NULLIF(calls, 0) as avg_time
      FROM pg_stat_user_functions
      WHERE schemaname = $1 AND funcname = $2
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName, functionName]);
    return result.rows[0] || null;
  }
}

module.exports = new FunctionService();
