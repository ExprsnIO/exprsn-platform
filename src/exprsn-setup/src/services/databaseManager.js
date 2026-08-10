/**
 * ═══════════════════════════════════════════════════════════════════════
 * Database Manager
 * Manages PostgreSQL databases for Exprsn microservices
 * ═══════════════════════════════════════════════════════════════════════
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const logger = require('../utils/logger');

const execAsync = promisify(exec);

class DatabaseManager {
  constructor() {
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
  }

  /**
   * Test PostgreSQL connection
   */
  async testConnection(host = 'localhost', port = 5432, user = 'postgres', password = '') {
    try {
      const pgPassword = password ? `PGPASSWORD=${password} ` : '';
      const command = `${pgPassword}psql -h ${host} -p ${port} -U ${user} -c "SELECT version();" postgres`;

      const { stdout } = await execAsync(command);

      logger.info('PostgreSQL connection test successful', { host, port, user });

      return {
        success: true,
        connected: true,
        version: stdout.trim().split('\n')[2]?.trim() || 'Unknown',
        host,
        port,
        user
      };
    } catch (error) {
      logger.error('PostgreSQL connection test failed:', error);
      return {
        success: false,
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Check if a database exists
   */
  async databaseExists(dbName, host = 'localhost', port = 5432, user = 'postgres', password = '') {
    try {
      const pgPassword = password ? `PGPASSWORD=${password} ` : '';
      const command = `${pgPassword}psql -h ${host} -p ${port} -U ${user} -lqt | cut -d \\| -f 1 | grep -qw ${dbName}`;

      await execAsync(command);

      return { exists: true, database: dbName };
    } catch (error) {
      return { exists: false, database: dbName };
    }
  }

  /**
   * Create a database
   */
  async createDatabase(dbName, host = 'localhost', port = 5432, user = 'postgres', password = '') {
    try {
      // Check if exists first
      const check = await this.databaseExists(dbName, host, port, user, password);
      if (check.exists) {
        return {
          success: true,
          created: false,
          alreadyExists: true,
          database: dbName
        };
      }

      const pgPassword = password ? `PGPASSWORD=${password} ` : '';
      const command = `${pgPassword}psql -h ${host} -p ${port} -U ${user} -c "CREATE DATABASE ${dbName};" postgres`;

      await execAsync(command);

      logger.info(`Created database: ${dbName}`, { host, port });

      return {
        success: true,
        created: true,
        database: dbName
      };
    } catch (error) {
      logger.error(`Failed to create database ${dbName}:`, error);
      throw error;
    }
  }

  /**
   * Drop a database
   */
  async dropDatabase(dbName, host = 'localhost', port = 5432, user = 'postgres', password = '') {
    try {
      const pgPassword = password ? `PGPASSWORD=${password} ` : '';
      const command = `${pgPassword}psql -h ${host} -p ${port} -U ${user} -c "DROP DATABASE IF EXISTS ${dbName};" postgres`;

      await execAsync(command);

      logger.info(`Dropped database: ${dbName}`, { host, port });

      return {
        success: true,
        dropped: true,
        database: dbName
      };
    } catch (error) {
      logger.error(`Failed to drop database ${dbName}:`, error);
      throw error;
    }
  }

  /**
   * List all databases
   */
  async listDatabases(host = 'localhost', port = 5432, user = 'postgres', password = '') {
    try {
      const pgPassword = password ? `PGPASSWORD=${password} ` : '';
      const command = `${pgPassword}psql -h ${host} -p ${port} -U ${user} -c "SELECT datname, pg_size_pretty(pg_database_size(datname)) as size FROM pg_database WHERE datistemplate = false ORDER BY datname;" postgres -t`;

      const { stdout } = await execAsync(command);

      const databases = stdout
        .trim()
        .split('\n')
        .map(line => {
          const parts = line.trim().split('|');
          if (parts.length >= 2) {
            return {
              name: parts[0].trim(),
              size: parts[1].trim()
            };
          }
          return null;
        })
        .filter(Boolean);

      return {
        success: true,
        count: databases.length,
        databases
      };
    } catch (error) {
      logger.error('Failed to list databases:', error);
      throw error;
    }
  }

  /**
   * Get database size
   */
  async getDatabaseSize(dbName, host = 'localhost', port = 5432, user = 'postgres', password = '') {
    try {
      const pgPassword = password ? `PGPASSWORD=${password} ` : '';
      const command = `${pgPassword}psql -h ${host} -p ${port} -U ${user} -c "SELECT pg_size_pretty(pg_database_size('${dbName}'));" postgres -t`;

      const { stdout } = await execAsync(command);

      return {
        success: true,
        database: dbName,
        size: stdout.trim()
      };
    } catch (error) {
      logger.error(`Failed to get size for database ${dbName}:`, error);
      throw error;
    }
  }

  /**
   * Get table count for a database
   */
  async getTableCount(dbName, host = 'localhost', port = 5432, user = 'postgres', password = '') {
    try {
      const pgPassword = password ? `PGPASSWORD=${password} ` : '';
      const command = `${pgPassword}psql -h ${host} -p ${port} -U ${user} -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public';" ${dbName} -t`;

      const { stdout } = await execAsync(command);

      return {
        success: true,
        database: dbName,
        tableCount: parseInt(stdout.trim())
      };
    } catch (error) {
      logger.error(`Failed to get table count for ${dbName}:`, error);
      throw error;
    }
  }

  /**
   * Get database info for a service
   */
  async getServiceDatabaseInfo(serviceId, config = {}) {
    try {
      const dbName = this.serviceDatabases[serviceId];
      if (!dbName) {
        throw new Error(`Unknown service: ${serviceId}`);
      }

      const { host = 'localhost', port = 5432, user = 'postgres', password = '' } = config;

      const [exists, size, tableCount] = await Promise.all([
        this.databaseExists(dbName, host, port, user, password),
        this.getDatabaseSize(dbName, host, port, user, password).catch(() => ({ size: 'Unknown' })),
        this.getTableCount(dbName, host, port, user, password).catch(() => ({ tableCount: 0 }))
      ]);

      return {
        success: true,
        service: serviceId,
        database: dbName,
        exists: exists.exists,
        size: size.size || 'Unknown',
        tableCount: tableCount.tableCount || 0,
        host,
        port
      };
    } catch (error) {
      logger.error(`Failed to get database info for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * Get all service databases info
   */
  async getAllServiceDatabasesInfo(config = {}) {
    const results = [];

    for (const [serviceId, dbName] of Object.entries(this.serviceDatabases)) {
      try {
        const info = await this.getServiceDatabaseInfo(serviceId, config);
        results.push(info);
      } catch (error) {
        logger.error(`Error getting database info for ${serviceId}:`, error);
        results.push({
          success: false,
          service: serviceId,
          database: dbName,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Run SQL query
   */
  async runQuery(dbName, query, host = 'localhost', port = 5432, user = 'postgres', password = '') {
    try {
      const pgPassword = password ? `PGPASSWORD=${password} ` : '';
      const safeQuery = query.replace(/"/g, '\\"');
      const command = `${pgPassword}psql -h ${host} -p ${port} -U ${user} -c "${safeQuery}" ${dbName}`;

      const { stdout, stderr } = await execAsync(command);

      return {
        success: true,
        database: dbName,
        output: stdout,
        error: stderr || null
      };
    } catch (error) {
      logger.error(`Failed to run query on ${dbName}:`, error);
      throw error;
    }
  }

  /**
   * Backup database
   */
  async backupDatabase(dbName, outputPath, host = 'localhost', port = 5432, user = 'postgres', password = '') {
    try {
      const pgPassword = password ? `PGPASSWORD=${password} ` : '';
      const command = `${pgPassword}pg_dump -h ${host} -p ${port} -U ${user} -F c -b -v -f ${outputPath} ${dbName}`;

      await execAsync(command);

      logger.info(`Backed up database ${dbName} to ${outputPath}`);

      return {
        success: true,
        database: dbName,
        backupPath: outputPath
      };
    } catch (error) {
      logger.error(`Failed to backup database ${dbName}:`, error);
      throw error;
    }
  }

  /**
   * Restore database
   */
  async restoreDatabase(dbName, backupPath, host = 'localhost', port = 5432, user = 'postgres', password = '') {
    try {
      const pgPassword = password ? `PGPASSWORD=${password} ` : '';
      const command = `${pgPassword}pg_restore -h ${host} -p ${port} -U ${user} -d ${dbName} -v ${backupPath}`;

      await execAsync(command);

      logger.info(`Restored database ${dbName} from ${backupPath}`);

      return {
        success: true,
        database: dbName,
        restoredFrom: backupPath
      };
    } catch (error) {
      logger.error(`Failed to restore database ${dbName}:`, error);
      throw error;
    }
  }
}

// Singleton instance
const databaseManager = new DatabaseManager();

module.exports = databaseManager;
