const connectionPoolManager = require('./ConnectionPoolManager');
const { logger } = require('@exprsn/shared');
const pgFormat = require('pg-format');

/**
 * Service for managing PostgreSQL triggers
 */
class TriggerService {
  /**
   * List all triggers in a schema or on a specific table
   */
  async listTriggers(connectionConfig, schemaName = 'public', tableName = null) {
    let query = `
      SELECT
        t.tgname as name,
        c.relname as table_name,
        n.nspname as schema,
        pg_catalog.pg_get_userbyid(c.relowner) as owner,
        CASE
          WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
          WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
          ELSE 'AFTER'
        END as timing,
        ARRAY(
          SELECT CASE
            WHEN t.tgtype & 4 = 4 THEN 'INSERT'
            WHEN t.tgtype & 8 = 8 THEN 'DELETE'
            WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
            WHEN t.tgtype & 32 = 32 THEN 'TRUNCATE'
          END
        ) as events,
        CASE
          WHEN t.tgtype & 1 = 1 THEN 'ROW'
          ELSE 'STATEMENT'
        END as level,
        p.proname as function_name,
        t.tgenabled as is_enabled,
        pg_catalog.pg_get_triggerdef(t.oid, true) as definition,
        pg_catalog.obj_description(t.oid, 'pg_trigger') as description
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname = $1
        AND NOT t.tgisinternal
    `;

    const params = [schemaName];

    if (tableName) {
      query += ` AND c.relname = $2`;
      params.push(tableName);
    }

    query += ` ORDER BY c.relname, t.tgname`;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, params);
    return result.rows;
  }

  /**
   * Get trigger details
   */
  async getTrigger(connectionConfig, schemaName, tableName, triggerName) {
    const query = `
      SELECT
        t.tgname as name,
        c.relname as table_name,
        n.nspname as schema,
        pg_catalog.pg_get_userbyid(c.relowner) as owner,
        CASE
          WHEN t.tgtype & 2 = 2 THEN 'BEFORE'
          WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF'
          ELSE 'AFTER'
        END as timing,
        CASE
          WHEN t.tgtype & 4 = 4 THEN 'INSERT'
          WHEN t.tgtype & 8 = 8 THEN 'DELETE'
          WHEN t.tgtype & 16 = 16 THEN 'UPDATE'
          WHEN t.tgtype & 32 = 32 THEN 'TRUNCATE'
        END as event,
        CASE
          WHEN t.tgtype & 1 = 1 THEN 'ROW'
          ELSE 'STATEMENT'
        END as level,
        p.proname as function_name,
        t.tgargs as arguments,
        t.tgenabled as is_enabled,
        t.tgdeferrable as is_deferrable,
        t.tginitdeferred as initially_deferred,
        pg_catalog.pg_get_triggerdef(t.oid, true) as definition,
        pg_catalog.obj_description(t.oid, 'pg_trigger') as description
      FROM pg_catalog.pg_trigger t
      JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
      WHERE n.nspname = $1
        AND c.relname = $2
        AND t.tgname = $3
        AND NOT t.tgisinternal
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName, tableName, triggerName]);
    return result.rows[0] || null;
  }

  /**
   * Create a trigger
   */
  async createTrigger(connectionConfig, definition) {
    // The definition should be a complete CREATE TRIGGER statement
    await connectionPoolManager.executeQuery(connectionConfig, definition);

    logger.info('Trigger created', { definition: definition.substring(0, 100) });
    return { success: true, message: 'Trigger created successfully' };
  }

  /**
   * Drop a trigger
   */
  async dropTrigger(connectionConfig, schemaName, tableName, triggerName, cascade = false, ifExists = true) {
    const ifExistsClause = ifExists ? 'IF EXISTS' : '';
    const cascadeClause = cascade ? 'CASCADE' : '';

    const sql = pgFormat(
      'DROP TRIGGER %s %I ON %I.%I %s',
      ifExistsClause,
      triggerName,
      schemaName,
      tableName,
      cascadeClause
    );

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Trigger dropped', { schema: schemaName, table: tableName, trigger: triggerName });
    return { success: true, message: `Trigger '${triggerName}' dropped successfully` };
  }

  /**
   * Enable/disable a trigger
   */
  async setTriggerState(connectionConfig, schemaName, tableName, triggerName, enabled) {
    const state = enabled ? 'ENABLE' : 'DISABLE';
    const sql = pgFormat(
      'ALTER TABLE %I.%I %s TRIGGER %I',
      schemaName,
      tableName,
      state,
      triggerName
    );

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Trigger state changed', { schema: schemaName, table: tableName, trigger: triggerName, enabled });
    return { success: true, message: `Trigger '${triggerName}' ${enabled ? 'enabled' : 'disabled'} successfully` };
  }

  /**
   * Rename a trigger
   */
  async renameTrigger(connectionConfig, schemaName, tableName, oldName, newName) {
    const sql = pgFormat(
      'ALTER TRIGGER %I ON %I.%I RENAME TO %I',
      oldName,
      schemaName,
      tableName,
      newName
    );

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Trigger renamed', { schema: schemaName, table: tableName, oldName, newName });
    return { success: true, message: `Trigger renamed from '${oldName}' to '${newName}' successfully` };
  }

  /**
   * Get trigger function source
   */
  async getTriggerFunction(connectionConfig, schemaName, functionName) {
    const query = `
      SELECT
        p.proname as name,
        n.nspname as schema,
        pg_catalog.pg_get_functiondef(p.oid) as definition,
        p.prosrc as source_code,
        l.lanname as language
      FROM pg_catalog.pg_proc p
      JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_catalog.pg_language l ON l.oid = p.prolang
      WHERE n.nspname = $1 AND p.proname = $2
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName, functionName]);
    return result.rows[0] || null;
  }
}

module.exports = new TriggerService();
