const connectionPoolManager = require('./ConnectionPoolManager');
const { logger } = require('@exprsn/shared');
const pgFormat = require('pg-format');

/**
 * Service for managing PostgreSQL sequences
 */
class SequenceService {
  /**
   * List all sequences in a schema
   */
  async listSequences(connectionConfig, schemaName = 'public') {
    const query = `
      SELECT
        c.relname as name,
        n.nspname as schema,
        pg_catalog.pg_get_userbyid(c.relowner) as owner,
        s.seqstart as start_value,
        s.seqmin as min_value,
        s.seqmax as max_value,
        s.seqincrement as increment_by,
        s.seqcycle as is_cycle,
        s.seqcache as cache_size,
        pg_catalog.obj_description(c.oid, 'pg_class') as description,
        (SELECT last_value FROM pg_catalog.pg_sequences WHERE schemaname = n.nspname AND sequencename = c.relname) as last_value
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_catalog.pg_sequence s ON s.seqrelid = c.oid
      WHERE c.relkind = 'S'
        AND n.nspname = $1
      ORDER BY c.relname
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName]);
    return result.rows;
  }

  /**
   * Get sequence details
   */
  async getSequence(connectionConfig, schemaName, sequenceName) {
    const query = `
      SELECT
        c.relname as name,
        n.nspname as schema,
        pg_catalog.pg_get_userbyid(c.relowner) as owner,
        s.seqstart as start_value,
        s.seqmin as min_value,
        s.seqmax as max_value,
        s.seqincrement as increment_by,
        s.seqcycle as is_cycle,
        s.seqcache as cache_size,
        s.seqtypid::regtype as data_type,
        pg_catalog.obj_description(c.oid, 'pg_class') as description,
        (SELECT last_value FROM pg_catalog.pg_sequences WHERE schemaname = n.nspname AND sequencename = c.relname) as last_value,
        (SELECT is_called FROM pg_catalog.pg_sequences WHERE schemaname = n.nspname AND sequencename = c.relname) as is_called
      FROM pg_catalog.pg_class c
      JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_catalog.pg_sequence s ON s.seqrelid = c.oid
      WHERE c.relkind = 'S'
        AND n.nspname = $1
        AND c.relname = $2
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName, sequenceName]);
    return result.rows[0] || null;
  }

  /**
   * Create a sequence
   */
  async createSequence(connectionConfig, schemaName, sequenceName, options = {}) {
    const {
      increment = 1,
      minValue = null,
      maxValue = null,
      start = null,
      cache = 1,
      cycle = false,
      ownedBy = null,
      dataType = 'bigint'
    } = options;

    let sql = pgFormat('CREATE SEQUENCE %I.%I', schemaName, sequenceName);

    if (dataType && dataType !== 'bigint') {
      sql += ` AS ${dataType}`;
    }

    if (increment !== 1) {
      sql += ` INCREMENT BY ${increment}`;
    }

    if (minValue !== null) {
      sql += ` MINVALUE ${minValue}`;
    } else {
      sql += ' NO MINVALUE';
    }

    if (maxValue !== null) {
      sql += ` MAXVALUE ${maxValue}`;
    } else {
      sql += ' NO MAXVALUE';
    }

    if (start !== null) {
      sql += ` START WITH ${start}`;
    }

    if (cache > 1) {
      sql += ` CACHE ${cache}`;
    }

    if (cycle) {
      sql += ' CYCLE';
    }

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    // Set owned by if specified
    if (ownedBy) {
      const ownedBySql = pgFormat(
        'ALTER SEQUENCE %I.%I OWNED BY %s',
        schemaName,
        sequenceName,
        ownedBy
      );
      await connectionPoolManager.executeQuery(connectionConfig, ownedBySql);
    }

    logger.info('Sequence created', { schema: schemaName, name: sequenceName, options });
    return { success: true, message: `Sequence '${schemaName}.${sequenceName}' created successfully` };
  }

  /**
   * Alter a sequence
   */
  async alterSequence(connectionConfig, schemaName, sequenceName, changes) {
    const queries = [];

    if (changes.increment !== undefined) {
      queries.push(pgFormat(
        'ALTER SEQUENCE %I.%I INCREMENT BY %s',
        schemaName, sequenceName, changes.increment
      ));
    }

    if (changes.minValue !== undefined) {
      queries.push(pgFormat(
        'ALTER SEQUENCE %I.%I MINVALUE %s',
        schemaName, sequenceName, changes.minValue
      ));
    }

    if (changes.maxValue !== undefined) {
      queries.push(pgFormat(
        'ALTER SEQUENCE %I.%I MAXVALUE %s',
        schemaName, sequenceName, changes.maxValue
      ));
    }

    if (changes.restart !== undefined) {
      queries.push(pgFormat(
        'ALTER SEQUENCE %I.%I RESTART WITH %s',
        schemaName, sequenceName, changes.restart
      ));
    }

    if (changes.cache !== undefined) {
      queries.push(pgFormat(
        'ALTER SEQUENCE %I.%I CACHE %s',
        schemaName, sequenceName, changes.cache
      ));
    }

    if (changes.cycle !== undefined) {
      queries.push(pgFormat(
        'ALTER SEQUENCE %I.%I %s',
        schemaName, sequenceName, changes.cycle ? 'CYCLE' : 'NO CYCLE'
      ));
    }

    if (changes.ownedBy !== undefined) {
      queries.push(pgFormat(
        'ALTER SEQUENCE %I.%I OWNED BY %s',
        schemaName, sequenceName, changes.ownedBy
      ));
    }

    if (changes.rename) {
      queries.push(pgFormat(
        'ALTER SEQUENCE %I.%I RENAME TO %I',
        schemaName, sequenceName, changes.rename
      ));
    }

    for (const query of queries) {
      await connectionPoolManager.executeQuery(connectionConfig, query);
    }

    logger.info('Sequence altered', { schema: schemaName, name: sequenceName, changes });
    return { success: true, message: `Sequence '${schemaName}.${sequenceName}' altered successfully` };
  }

  /**
   * Drop a sequence
   */
  async dropSequence(connectionConfig, schemaName, sequenceName, cascade = false, ifExists = true) {
    const ifExistsClause = ifExists ? 'IF EXISTS' : '';
    const cascadeClause = cascade ? 'CASCADE' : '';

    const sql = pgFormat(
      'DROP SEQUENCE %s %I.%I %s',
      ifExistsClause,
      schemaName,
      sequenceName,
      cascadeClause
    );

    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Sequence dropped', { schema: schemaName, name: sequenceName, cascade });
    return { success: true, message: `Sequence '${schemaName}.${sequenceName}' dropped successfully` };
  }

  /**
   * Get next value from sequence
   */
  async nextValue(connectionConfig, schemaName, sequenceName) {
    const sql = pgFormat('SELECT nextval(%L) as next_value', `${schemaName}.${sequenceName}`);
    const result = await connectionPoolManager.executeQuery(connectionConfig, sql);
    return result.rows[0].next_value;
  }

  /**
   * Get current value from sequence (without incrementing)
   */
  async currentValue(connectionConfig, schemaName, sequenceName) {
    const sql = pgFormat('SELECT currval(%L) as current_value', `${schemaName}.${sequenceName}`);
    try {
      const result = await connectionPoolManager.executeQuery(connectionConfig, sql);
      return result.rows[0].current_value;
    } catch (error) {
      if (error.message.includes('currval')) {
        return null; // Sequence not yet used in this session
      }
      throw error;
    }
  }

  /**
   * Set sequence value
   */
  async setValue(connectionConfig, schemaName, sequenceName, value, isCalled = true) {
    const sql = pgFormat(
      'SELECT setval(%L, %s, %s) as new_value',
      `${schemaName}.${sequenceName}`,
      value,
      isCalled
    );
    const result = await connectionPoolManager.executeQuery(connectionConfig, sql);
    return result.rows[0].new_value;
  }

  /**
   * Reset sequence to start value
   */
  async resetSequence(connectionConfig, schemaName, sequenceName) {
    const sql = pgFormat('ALTER SEQUENCE %I.%I RESTART', schemaName, sequenceName);
    await connectionPoolManager.executeQuery(connectionConfig, sql);

    logger.info('Sequence reset', { schema: schemaName, name: sequenceName });
    return { success: true, message: `Sequence '${schemaName}.${sequenceName}' reset successfully` };
  }

  /**
   * Get sequences owned by a table column
   */
  async getTableSequences(connectionConfig, schemaName, tableName) {
    const query = `
      SELECT
        s.relname as sequence_name,
        a.attname as column_name
      FROM pg_catalog.pg_class s
      JOIN pg_catalog.pg_depend d ON d.objid = s.oid
      JOIN pg_catalog.pg_class t ON d.refobjid = t.oid
      JOIN pg_catalog.pg_attribute a ON (a.attrelid = t.oid AND a.attnum = d.refobjsubid)
      JOIN pg_catalog.pg_namespace n ON n.oid = s.relnamespace
      WHERE s.relkind = 'S'
        AND n.nspname = $1
        AND t.relname = $2
        AND d.deptype = 'a'
    `;

    const result = await connectionPoolManager.executeQuery(connectionConfig, query, [schemaName, tableName]);
    return result.rows;
  }
}

module.exports = new SequenceService();
