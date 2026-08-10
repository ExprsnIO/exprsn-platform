/**
 * ═══════════════════════════════════════════════════════════════════════
 * PostgreSQL Manager
 * Comprehensive PostgreSQL database management for Exprsn services
 * ═══════════════════════════════════════════════════════════════════════
 */

const { Client, Pool } = require('pg');
const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');
const logger = require('../../utils/logger');

const execAsync = promisify(exec);

class PostgreSQLManager {
  constructor() {
    // Default PostgreSQL configuration
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      // Connection pool settings
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    };

    // Service database mappings
    this.serviceDatabases = {
      ca: 'exprsn_ca',
      auth: 'exprsn_auth',
      spark: 'exprsn_spark',
      timeline: 'exprsn_timeline',
      prefetch: 'exprsn_prefetch',
      moderator: 'exprsn_moderator',
      filevault: 'exprsn_filevault',
      gallery: 'exprsn_gallery',
      live: 'exprsn_live',
      bridge: 'exprsn_bridge',
      nexus: 'exprsn_nexus',
      pulse: 'exprsn_pulse',
      vault: 'exprsn_vault',
      herald: 'exprsn_herald',
      setup: 'exprsn_setup',
      forge: 'exprsn_forge',
      workflow: 'exprsn_workflow',
      svr: 'exprsn_svr'
    };

    // Connection pools per service (lazy initialization)
    this.pools = new Map();
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * CONNECTION MANAGEMENT
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Get or create connection pool for a database
   */
  getPool(databaseName) {
    if (!this.pools.has(databaseName)) {
      const pool = new Pool({
        ...this.config,
        database: databaseName
      });

      // Handle pool errors
      pool.on('error', (err) => {
        logger.error(`PostgreSQL pool error for ${databaseName}:`, err);
      });

      this.pools.set(databaseName, pool);
    }

    return this.pools.get(databaseName);
  }

  /**
   * Create a single client connection (for admin operations)
   */
  async createClient(databaseName = 'postgres') {
    const client = new Client({
      ...this.config,
      database: databaseName
    });

    await client.connect();
    return client;
  }

  /**
   * Test PostgreSQL connection
   */
  async testConnection() {
    let client;
    try {
      client = await this.createClient('postgres');
      const result = await client.query('SELECT version(), current_database(), current_user');

      return {
        success: true,
        connected: true,
        version: result.rows[0].version,
        currentDatabase: result.rows[0].current_database,
        currentUser: result.rows[0].current_user,
        host: this.config.host,
        port: this.config.port
      };
    } catch (error) {
      logger.error('PostgreSQL connection test failed:', error);
      return {
        success: false,
        connected: false,
        error: error.message
      };
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * DATABASE OPERATIONS
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * List all databases
   */
  async listDatabases() {
    let client;
    try {
      client = await this.createClient('postgres');

      const result = await client.query(`
        SELECT
          d.datname as name,
          pg_database_size(d.datname) as size,
          pg_size_pretty(pg_database_size(d.datname)) as size_pretty,
          (SELECT count(*) FROM pg_stat_activity WHERE datname = d.datname) as connections,
          d.datcollate as collation,
          d.datctype as ctype,
          pg_catalog.shobj_description(d.oid, 'pg_database') as description
        FROM pg_database d
        WHERE d.datistemplate = false
        ORDER BY d.datname
      `);

      // Mark which databases belong to Exprsn services
      const databases = result.rows.map(db => ({
        ...db,
        size: parseInt(db.size),
        connections: parseInt(db.connections),
        isExprsn: Object.values(this.serviceDatabases).includes(db.name),
        service: Object.keys(this.serviceDatabases).find(
          key => this.serviceDatabases[key] === db.name
        ) || null
      }));

      return {
        success: true,
        databases,
        total: databases.length,
        exprsnDatabases: databases.filter(db => db.isExprsn).length
      };
    } catch (error) {
      logger.error('Failed to list databases:', error);
      throw error;
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * Get database details
   */
  async getDatabaseDetails(databaseName) {
    let client;
    try {
      client = await this.createClient(databaseName);

      // Get database size
      const sizeResult = await client.query(`
        SELECT pg_database_size(current_database()) as size,
               pg_size_pretty(pg_database_size(current_database())) as size_pretty
      `);

      // Get table statistics
      const tablesResult = await client.query(`
        SELECT
          schemaname,
          tablename,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          pg_total_relation_size(schemaname||'.'||tablename) as size_bytes,
          (SELECT count(*) FROM information_schema.columns
           WHERE table_schema = schemaname AND table_name = tablename) as column_count,
          (SELECT count(*) FROM pg_indexes
           WHERE schemaname = tables.schemaname AND tablename = tables.tablename) as index_count
        FROM pg_tables tables
        WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
        ORDER BY size_bytes DESC
        LIMIT 50
      `);

      // Get connection statistics
      const connectionsResult = await client.query(`
        SELECT
          state,
          count(*) as count,
          max(now() - state_change) as max_duration
        FROM pg_stat_activity
        WHERE datname = current_database()
        GROUP BY state
      `);

      // Get database stats
      const statsResult = await client.query(`
        SELECT
          numbackends as connections,
          xact_commit as commits,
          xact_rollback as rollbacks,
          blks_read as blocks_read,
          blks_hit as blocks_hit,
          tup_returned as tuples_returned,
          tup_fetched as tuples_fetched,
          tup_inserted as tuples_inserted,
          tup_updated as tuples_updated,
          tup_deleted as tuples_deleted,
          conflicts,
          temp_files,
          temp_bytes,
          deadlocks,
          blk_read_time,
          blk_write_time
        FROM pg_stat_database
        WHERE datname = current_database()
      `);

      return {
        success: true,
        database: databaseName,
        size: parseInt(sizeResult.rows[0].size),
        sizePretty: sizeResult.rows[0].size_pretty,
        tables: tablesResult.rows.map(t => ({
          ...t,
          size_bytes: parseInt(t.size_bytes),
          column_count: parseInt(t.column_count),
          index_count: parseInt(t.index_count)
        })),
        tableCount: tablesResult.rows.length,
        connections: connectionsResult.rows.map(c => ({
          state: c.state,
          count: parseInt(c.count),
          maxDuration: c.max_duration
        })),
        stats: statsResult.rows[0] ? {
          connections: parseInt(statsResult.rows[0].connections),
          commits: parseInt(statsResult.rows[0].commits),
          rollbacks: parseInt(statsResult.rows[0].rollbacks),
          blocksRead: parseInt(statsResult.rows[0].blocks_read),
          blocksHit: parseInt(statsResult.rows[0].blocks_hit),
          tuplesReturned: parseInt(statsResult.rows[0].tuples_returned),
          tuplesFetched: parseInt(statsResult.rows[0].tuples_fetched),
          tuplesInserted: parseInt(statsResult.rows[0].tuples_inserted),
          tuplesUpdated: parseInt(statsResult.rows[0].tuples_updated),
          tuplesDeleted: parseInt(statsResult.rows[0].tuples_deleted),
          conflicts: parseInt(statsResult.rows[0].conflicts),
          tempFiles: parseInt(statsResult.rows[0].temp_files),
          tempBytes: parseInt(statsResult.rows[0].temp_bytes),
          deadlocks: parseInt(statsResult.rows[0].deadlocks),
          blockReadTime: parseFloat(statsResult.rows[0].blk_read_time),
          blockWriteTime: parseFloat(statsResult.rows[0].blk_write_time)
        } : null
      };
    } catch (error) {
      logger.error(`Failed to get details for database ${databaseName}:`, error);
      throw error;
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * Create a database
   */
  async createDatabase(databaseName, options = {}) {
    let client;
    try {
      client = await this.createClient('postgres');

      // Check if database already exists
      const checkResult = await client.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [databaseName]
      );

      if (checkResult.rows.length > 0) {
        return {
          success: false,
          error: 'Database already exists',
          database: databaseName,
          alreadyExists: true
        };
      }

      // Create database
      const encoding = options.encoding || 'UTF8';
      const locale = options.locale || 'en_US.UTF-8';
      const template = options.template || 'template0';

      await client.query(`
        CREATE DATABASE "${databaseName}"
        WITH ENCODING '${encoding}'
        LC_COLLATE '${locale}'
        LC_CTYPE '${locale}'
        TEMPLATE ${template}
      `);

      logger.info(`Created database: ${databaseName}`);

      return {
        success: true,
        database: databaseName,
        message: 'Database created successfully'
      };
    } catch (error) {
      logger.error(`Failed to create database ${databaseName}:`, error);
      throw error;
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * Drop a database
   */
  async dropDatabase(databaseName, options = {}) {
    let client;
    try {
      client = await this.createClient('postgres');

      // Check if database exists
      const checkResult = await client.query(
        'SELECT 1 FROM pg_database WHERE datname = $1',
        [databaseName]
      );

      if (checkResult.rows.length === 0) {
        return {
          success: false,
          error: 'Database does not exist',
          database: databaseName
        };
      }

      // Terminate all connections to the database
      if (!options.skipTerminateConnections) {
        await client.query(`
          SELECT pg_terminate_backend(pg_stat_activity.pid)
          FROM pg_stat_activity
          WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid()
        `, [databaseName]);
      }

      // Drop database
      await client.query(`DROP DATABASE "${databaseName}"`);

      // Close pool if exists
      if (this.pools.has(databaseName)) {
        await this.pools.get(databaseName).end();
        this.pools.delete(databaseName);
      }

      logger.info(`Dropped database: ${databaseName}`);

      return {
        success: true,
        database: databaseName,
        message: 'Database dropped successfully'
      };
    } catch (error) {
      logger.error(`Failed to drop database ${databaseName}:`, error);
      throw error;
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * Create all Exprsn service databases
   */
  async createAllServiceDatabases() {
    const results = {
      success: true,
      created: [],
      skipped: [],
      failed: [],
      total: Object.keys(this.serviceDatabases).length
    };

    for (const [service, dbName] of Object.entries(this.serviceDatabases)) {
      try {
        const result = await this.createDatabase(dbName);

        if (result.success) {
          results.created.push({ service, database: dbName });
        } else if (result.alreadyExists) {
          results.skipped.push({ service, database: dbName, reason: 'Already exists' });
        } else {
          results.failed.push({ service, database: dbName, error: result.error });
        }
      } catch (error) {
        results.failed.push({ service, database: dbName, error: error.message });
        results.success = false;
      }
    }

    logger.info(`Created ${results.created.length}/${results.total} service databases`);

    return results;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * MIGRATION MANAGEMENT
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Get migration status for a service
   */
  async getMigrationStatus(serviceId) {
    try {
      const serviceDir = path.join(__dirname, '../../../../', this.getServiceDir(serviceId));
      const migrationsDir = path.join(serviceDir, 'migrations');

      // Check if migrations directory exists
      try {
        await fs.access(migrationsDir);
      } catch (err) {
        return {
          success: true,
          service: serviceId,
          hasMigrations: false,
          pending: [],
          executed: []
        };
      }

      // Read migration files
      const files = await fs.readdir(migrationsDir);
      const migrationFiles = files
        .filter(f => f.endsWith('.js'))
        .sort();

      // Get executed migrations from database
      const dbName = this.serviceDatabases[serviceId];
      const pool = this.getPool(dbName);

      let executedMigrations = [];
      try {
        const result = await pool.query(`
          SELECT name FROM "SequelizeMeta" ORDER BY name
        `);
        executedMigrations = result.rows.map(r => r.name);
      } catch (err) {
        // SequelizeMeta table might not exist yet
        logger.debug(`SequelizeMeta table not found for ${serviceId}`);
      }

      const pending = migrationFiles.filter(f => !executedMigrations.includes(f));
      const executed = migrationFiles.filter(f => executedMigrations.includes(f));

      return {
        success: true,
        service: serviceId,
        database: dbName,
        hasMigrations: true,
        total: migrationFiles.length,
        pending: pending.map(name => ({ name, status: 'pending' })),
        executed: executed.map(name => ({ name, status: 'executed' })),
        pendingCount: pending.length,
        executedCount: executed.length
      };
    } catch (error) {
      logger.error(`Failed to get migration status for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Run migrations for a service
   */
  async runMigrations(serviceId, options = {}) {
    try {
      const serviceDir = path.join(__dirname, '../../../../', this.getServiceDir(serviceId));

      // Build sequelize-cli command
      const env = options.env || process.env.NODE_ENV || 'development';
      const command = `cd "${serviceDir}" && npx sequelize-cli db:migrate --env ${env}`;

      logger.info(`Running migrations for ${serviceId}: ${command}`);

      const { stdout, stderr } = await execAsync(command);

      return {
        success: true,
        service: serviceId,
        message: 'Migrations executed successfully',
        output: stdout,
        errors: stderr || null
      };
    } catch (error) {
      logger.error(`Failed to run migrations for ${serviceId}:`, error);
      return {
        success: false,
        service: serviceId,
        error: error.message,
        output: error.stdout,
        errors: error.stderr
      };
    }
  }

  /**
   * Rollback migrations for a service
   */
  async rollbackMigrations(serviceId, options = {}) {
    try {
      const serviceDir = path.join(__dirname, '../../../../', this.getServiceDir(serviceId));

      const env = options.env || process.env.NODE_ENV || 'development';
      const steps = options.steps || 1;
      const command = `cd "${serviceDir}" && npx sequelize-cli db:migrate:undo${steps > 1 ? `:all --to ${steps}` : ''} --env ${env}`;

      logger.info(`Rolling back migrations for ${serviceId}: ${command}`);

      const { stdout, stderr } = await execAsync(command);

      return {
        success: true,
        service: serviceId,
        message: 'Migrations rolled back successfully',
        output: stdout,
        errors: stderr || null
      };
    } catch (error) {
      logger.error(`Failed to rollback migrations for ${serviceId}:`, error);
      return {
        success: false,
        service: serviceId,
        error: error.message,
        output: error.stdout,
        errors: error.stderr
      };
    }
  }

  /**
   * Run migrations for all services
   */
  async runAllMigrations(options = {}) {
    const results = {
      success: true,
      services: [],
      succeeded: [],
      failed: [],
      total: Object.keys(this.serviceDatabases).length
    };

    for (const serviceId of Object.keys(this.serviceDatabases)) {
      try {
        const result = await this.runMigrations(serviceId, options);
        results.services.push(result);

        if (result.success) {
          results.succeeded.push(serviceId);
        } else {
          results.failed.push(serviceId);
          results.success = false;
        }
      } catch (error) {
        results.services.push({
          success: false,
          service: serviceId,
          error: error.message
        });
        results.failed.push(serviceId);
        results.success = false;
      }
    }

    return results;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * MONITORING & PERFORMANCE
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Get active connections across all databases
   */
  async getActiveConnections() {
    let client;
    try {
      client = await this.createClient('postgres');

      const result = await client.query(`
        SELECT
          datname as database,
          usename as user,
          application_name,
          client_addr,
          state,
          query,
          state_change,
          now() - state_change as duration
        FROM pg_stat_activity
        WHERE datname IS NOT NULL
        AND datname NOT IN ('postgres', 'template0', 'template1')
        ORDER BY state_change DESC
      `);

      const connections = result.rows.map(conn => ({
        ...conn,
        isExprsn: Object.values(this.serviceDatabases).includes(conn.database),
        service: Object.keys(this.serviceDatabases).find(
          key => this.serviceDatabases[key] === conn.database
        ) || null
      }));

      return {
        success: true,
        connections,
        total: connections.length,
        byDatabase: this.groupBy(connections, 'database'),
        byState: this.groupBy(connections, 'state')
      };
    } catch (error) {
      logger.error('Failed to get active connections:', error);
      throw error;
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * Get server statistics
   */
  async getServerStats() {
    let client;
    try {
      client = await this.createClient('postgres');

      // Server version
      const versionResult = await client.query('SELECT version()');

      // Server settings
      const settingsResult = await client.query(`
        SELECT name, setting, unit, category, short_desc
        FROM pg_settings
        WHERE name IN (
          'max_connections',
          'shared_buffers',
          'effective_cache_size',
          'maintenance_work_mem',
          'checkpoint_completion_target',
          'wal_buffers',
          'default_statistics_target',
          'random_page_cost',
          'effective_io_concurrency',
          'work_mem',
          'min_wal_size',
          'max_wal_size'
        )
      `);

      // Database sizes
      const sizesResult = await client.query(`
        SELECT
          datname,
          pg_size_pretty(pg_database_size(datname)) as size
        FROM pg_database
        WHERE datistemplate = false
        ORDER BY pg_database_size(datname) DESC
      `);

      return {
        success: true,
        version: versionResult.rows[0].version,
        settings: settingsResult.rows.reduce((acc, row) => {
          acc[row.name] = {
            value: row.setting,
            unit: row.unit,
            category: row.category,
            description: row.short_desc
          };
          return acc;
        }, {}),
        databaseSizes: sizesResult.rows
      };
    } catch (error) {
      logger.error('Failed to get server stats:', error);
      throw error;
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * Terminate connections to a database
   */
  async terminateConnections(databaseName, options = {}) {
    let client;
    try {
      client = await this.createClient('postgres');

      const result = await client.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
        AND pid <> pg_backend_pid()
      `, [databaseName]);

      return {
        success: true,
        database: databaseName,
        terminated: result.rowCount,
        message: `Terminated ${result.rowCount} connection(s)`
      };
    } catch (error) {
      logger.error(`Failed to terminate connections for ${databaseName}:`, error);
      throw error;
    } finally {
      if (client) await client.end();
    }
  }

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * UTILITY METHODS
   * ═══════════════════════════════════════════════════════════════════════
   */

  /**
   * Get service directory name
   */
  getServiceDir(serviceId) {
    const dirMap = {
      ca: 'exprsn-ca',
      auth: 'exprsn-auth',
      spark: 'exprsn-spark',
      timeline: 'exprsn-timeline',
      prefetch: 'exprsn-prefetch',
      moderator: 'exprsn-moderator',
      filevault: 'exprsn-filevault',
      gallery: 'exprsn-gallery',
      live: 'exprsn-live',
      bridge: 'exprsn-bridge',
      nexus: 'exprsn-nexus',
      pulse: 'exprsn-pulse',
      vault: 'exprsn-vault',
      herald: 'exprsn-herald',
      setup: 'exprsn-setup',
      forge: 'exprsn-forge',
      workflow: 'exprsn-workflow',
      svr: 'exprsn-svr'
    };

    return dirMap[serviceId] || `exprsn-${serviceId}`;
  }

  /**
   * Group array by property
   */
  groupBy(array, property) {
    return array.reduce((acc, item) => {
      const key = item[property];
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(item);
      return acc;
    }, {});
  }

  /**
   * Close all connection pools
   */
  async closeAllPools() {
    const promises = [];
    for (const [dbName, pool] of this.pools.entries()) {
      promises.push(
        pool.end().then(() => {
          logger.info(`Closed connection pool for ${dbName}`);
        }).catch(err => {
          logger.error(`Failed to close pool for ${dbName}:`, err);
        })
      );
    }

    await Promise.all(promises);
    this.pools.clear();
  }
}

// Singleton instance
const postgresqlManager = new PostgreSQLManager();

module.exports = postgresqlManager;
