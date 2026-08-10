/**
 * PostgreSQL Connection Handler
 *
 * Handles connections to PostgreSQL databases with connection pooling.
 */

const { Pool } = require('pg');
const BaseConnectionHandler = require('./BaseConnectionHandler');

class PostgreSQLConnectionHandler extends BaseConnectionHandler {
  constructor(config) {
    super(config);
    this.pool = null;
    this.validateConfig(['host', 'database', 'user', 'password']);
  }

  /**
   * Connect to PostgreSQL
   */
  async connect() {
    if (this.pool) {
      return; // Already connected
    }

    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port || 5432,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        max: this.config.poolSize || 10,
        idleTimeoutMillis: this.config.idleTimeout || 30000,
        connectionTimeoutMillis: this.config.connectionTimeout || 5000,
        ssl: this.config.ssl || false
      });

      // Test the connection
      await this.testConnection();
    } catch (error) {
      this.handleError(error, { action: 'connect' });
    }
  }

  /**
   * Disconnect from PostgreSQL
   */
  async disconnect() {
    if (this.pool) {
      try {
        await this.pool.end();
        this.pool = null;
      } catch (error) {
        this.handleError(error, { action: 'disconnect' });
      }
    }
  }

  /**
   * Test connection
   */
  async testConnection() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as now, version() as version');
      client.release();

      return {
        success: true,
        timestamp: result.rows[0].now,
        version: result.rows[0].version
      };
    } catch (error) {
      this.handleError(error, { action: 'testConnection' });
    }
  }

  /**
   * Execute SQL query
   */
  async query(queryConfig) {
    const { sql, params = [], cacheKey = null } = queryConfig;

    // Ensure connected
    if (!this.pool) {
      await this.connect();
    }

    // Use cache if key provided
    if (cacheKey) {
      return this.getData(cacheKey, () => this.executeQuery(sql, params));
    }

    return this.executeQuery(sql, params);
  }

  /**
   * Execute query directly
   */
  async executeQuery(sql, params) {
    try {
      const result = await this.pool.query(sql, params);

      return {
        rows: result.rows,
        rowCount: result.rowCount,
        fields: result.fields?.map(f => ({
          name: f.name,
          dataType: f.dataTypeID,
          tableName: f.tableName
        }))
      };
    } catch (error) {
      this.handleError(error, { action: 'executeQuery', sql });
    }
  }

  /**
   * Get table schema
   */
  async getTableSchema(tableName) {
    const sql = `
      SELECT
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length
      FROM information_schema.columns
      WHERE table_name = $1
      ORDER BY ordinal_position
    `;

    const result = await this.query({ sql, params: [tableName] });

    return result.rows.map(row => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
      default: row.column_default,
      maxLength: row.character_maximum_length
    }));
  }

  /**
   * List tables
   */
  async listTables() {
    const sql = `
      SELECT
        table_name,
        table_type
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;

    const result = await this.query({ sql });
    return result.rows;
  }

  /**
   * Execute CRUD operations
   */
  async select(table, options = {}) {
    const {
      columns = ['*'],
      where = {},
      orderBy = [],
      limit = null,
      offset = null
    } = options;

    let sql = `SELECT ${columns.join(', ')} FROM ${table}`;
    const params = [];
    let paramCount = 0;

    // WHERE clause
    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        paramCount++;
        params.push(where[key]);
        return `${key} = $${paramCount}`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    // ORDER BY clause
    if (orderBy.length > 0) {
      sql += ` ORDER BY ${orderBy.join(', ')}`;
    }

    // LIMIT and OFFSET
    if (limit) {
      paramCount++;
      params.push(limit);
      sql += ` LIMIT $${paramCount}`;
    }

    if (offset) {
      paramCount++;
      params.push(offset);
      sql += ` OFFSET $${paramCount}`;
    }

    return this.query({ sql, params });
  }

  async insert(table, data) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    const placeholders = values.map((_, i) => `$${i + 1}`);

    const sql = `
      INSERT INTO ${table} (${columns.join(', ')})
      VALUES (${placeholders.join(', ')})
      RETURNING *
    `;

    return this.query({ sql, params: values });
  }

  async update(table, data, where = {}) {
    const columns = Object.keys(data);
    const values = Object.values(data);
    let paramCount = 0;

    const setClauses = columns.map(col => {
      paramCount++;
      return `${col} = $${paramCount}`;
    });

    let sql = `UPDATE ${table} SET ${setClauses.join(', ')}`;
    const params = [...values];

    // WHERE clause
    if (Object.keys(where).length > 0) {
      const conditions = Object.keys(where).map(key => {
        paramCount++;
        params.push(where[key]);
        return `${key} = $${paramCount}`;
      });
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    sql += ' RETURNING *';

    return this.query({ sql, params });
  }

  async delete(table, where = {}) {
    if (Object.keys(where).length === 0) {
      throw new Error('DELETE requires WHERE clause for safety');
    }

    const params = [];
    let paramCount = 0;

    const conditions = Object.keys(where).map(key => {
      paramCount++;
      params.push(where[key]);
      return `${key} = $${paramCount}`;
    });

    const sql = `DELETE FROM ${table} WHERE ${conditions.join(' AND ')} RETURNING *`;

    return this.query({ sql, params });
  }

  /**
   * Execute transaction
   */
  async transaction(callback) {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      const result = await callback(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      this.handleError(error, { action: 'transaction' });
    } finally {
      client.release();
    }
  }

  /**
   * Get connection pool stats
   */
  getPoolStats() {
    if (!this.pool) {
      return { connected: false };
    }

    return {
      connected: true,
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount
    };
  }
}

module.exports = PostgreSQLConnectionHandler;
