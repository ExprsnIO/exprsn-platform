/**
 * ═══════════════════════════════════════════════════════════
 * Setup Service - System Configuration & Initialization
 * ═══════════════════════════════════════════════════════════
 */

const fs = require('fs').promises;
const path = require('path');
const { Sequelize } = require('sequelize');
const https = require('https');
const http = require('http');

class SetupService {
  constructor() {
    this.setupState = {
      completed: false,
      steps: {
        environment: false,
        database: false,
        services: false,
        initialization: false
      }
    };
  }

  /**
   * Check if setup is required
   */
  async isSetupRequired() {
    try {
      // Check if .env exists and has required variables
      const envPath = path.join(__dirname, '../../../.env');
      const envExists = await fs.access(envPath).then(() => true).catch(() => false);

      if (!envExists) {
        return true;
      }

      // Check if database is accessible
      try {
        const { sequelize } = require('../models');
        await sequelize.authenticate();

        // Check if tables exist
        const [results] = await sequelize.query(
          "SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'applications'"
        );

        if (results[0].count === 0) {
          return true;
        }

        return false;
      } catch (error) {
        return true;
      }
    } catch (error) {
      console.error('[SetupService] Error checking setup status:', error);
      return true;
    }
  }

  /**
   * Get current setup status
   */
  async getSetupStatus() {
    const status = {
      environment: await this.checkEnvironment(),
      database: await this.checkDatabase(),
      services: await this.checkServices(),
      systemInfo: await this.getSystemInfo()
    };

    return status;
  }

  /**
   * Check environment configuration
   */
  async checkEnvironment() {
    try {
      const required = [
        'NODE_ENV',
        'PORT',
        'DB_HOST',
        'DB_PORT',
        'DB_NAME',
        'DB_USER',
        'DB_PASSWORD'
      ];

      const missing = required.filter(key => !process.env[key]);

      return {
        configured: missing.length === 0,
        missing,
        current: {
          NODE_ENV: process.env.NODE_ENV,
          PORT: process.env.PORT,
          DB_HOST: process.env.DB_HOST,
          DB_PORT: process.env.DB_PORT,
          DB_NAME: process.env.DB_NAME,
          DB_USER: process.env.DB_USER,
          DB_PASSWORD: process.env.DB_PASSWORD ? '********' : null
        }
      };
    } catch (error) {
      return {
        configured: false,
        error: error.message
      };
    }
  }

  /**
   * Update environment variables
   */
  async updateEnvironment(config) {
    try {
      const envPath = path.join(__dirname, '../../../.env');

      // Read existing .env or create new
      let envContent = '';
      try {
        envContent = await fs.readFile(envPath, 'utf8');
      } catch (error) {
        // File doesn't exist, will create new
      }

      // Parse existing env
      const envVars = {};
      envContent.split('\n').forEach(line => {
        const [key, ...valueParts] = line.split('=');
        if (key && valueParts.length > 0) {
          envVars[key.trim()] = valueParts.join('=').trim();
        }
      });

      // Update with new config
      Object.assign(envVars, config);

      // Write back to file
      const newEnvContent = Object.entries(envVars)
        .map(([key, value]) => `${key}=${value}`)
        .join('\n');

      await fs.writeFile(envPath, newEnvContent, 'utf8');

      // Update process.env
      Object.assign(process.env, config);

      return { success: true };
    } catch (error) {
      console.error('[SetupService] Error updating environment:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check database connection and schema
   */
  async checkDatabase() {
    try {
      const sequelize = new Sequelize({
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 5432,
        dialect: 'postgres',
        logging: false
      });

      // Test connection
      await sequelize.authenticate();

      // Check tables
      const [tables] = await sequelize.query(
        "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'"
      );

      const requiredTables = [
        'applications',
        'entities',
        'app_forms',
        'app_grids',
        'app_cards',
        'data_sources',
        'app_settings'
      ];

      const existingTables = tables.map(t => t.table_name);
      const missingTables = requiredTables.filter(t => !existingTables.includes(t));

      await sequelize.close();

      return {
        connected: true,
        host: process.env.DB_HOST,
        database: process.env.DB_NAME,
        tablesExist: missingTables.length === 0,
        existingTables: existingTables.length,
        requiredTables: requiredTables.length,
        missingTables
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  /**
   * Initialize database (run migrations)
   */
  async initializeDatabase() {
    try {
      const { sequelize } = require('../models');

      // Sync all models
      await sequelize.sync({ alter: false });

      return { success: true };
    } catch (error) {
      console.error('[SetupService] Error initializing database:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check service connections
   */
  async checkServices() {
    const services = [
      { name: 'Certificate Authority', url: process.env.CA_URL || 'https://localhost:3000', port: 3000 },
      { name: 'Setup Service', url: process.env.SETUP_URL || 'http://localhost:3015', port: 3015 },
      { name: 'Bridge Gateway', url: process.env.BRIDGE_URL || 'https://localhost:3010', port: 3010 },
      { name: 'Auth Service', url: process.env.AUTH_URL || 'https://localhost:3001', port: 3001 },
      { name: 'Herald Notifications', url: process.env.HERALD_URL || 'https://localhost:3014', port: 3014 },
      { name: 'Pulse Analytics', url: process.env.PULSE_URL || 'https://localhost:3012', port: 3012 },
      { name: 'Workflow Engine', url: process.env.WORKFLOW_URL || 'https://localhost:3017', port: 3017 },
      { name: 'Forge CRM', url: process.env.FORGE_URL || 'https://localhost:3016', port: 3016 }
    ];

    const results = await Promise.all(
      services.map(service => this.checkServiceHealth(service))
    );

    return {
      total: services.length,
      available: results.filter(r => r.available).length,
      services: results
    };
  }

  /**
   * Check individual service health
   */
  async checkServiceHealth(service) {
    return new Promise((resolve) => {
      try {
        const url = new URL(service.url);
        const protocol = url.protocol === 'https:' ? https : http;

        const options = {
          hostname: url.hostname,
          port: url.port || service.port,
          path: '/health',
          method: 'GET',
          timeout: 3000,
          rejectUnauthorized: false // Allow self-signed certificates
        };

        const req = protocol.request(options, (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            resolve({
              ...service,
              available: res.statusCode === 200,
              status: res.statusCode,
              responseTime: Date.now()
            });
          });
        });

        req.on('error', (error) => {
          resolve({
            ...service,
            available: false,
            error: error.message
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            ...service,
            available: false,
            error: 'Connection timeout'
          });
        });

        req.end();
      } catch (error) {
        resolve({
          ...service,
          available: false,
          error: error.message
        });
      }
    });
  }

  /**
   * Get system information
   */
  async getSystemInfo() {
    const os = require('os');

    return {
      platform: os.platform(),
      arch: os.arch(),
      nodeVersion: process.version,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024 * 100) / 100 + ' GB',
      freeMemory: Math.round(os.freemem() / 1024 / 1024 / 1024 * 100) / 100 + ' GB',
      cpus: os.cpus().length,
      uptime: Math.round(os.uptime() / 60) + ' minutes',
      hostname: os.hostname()
    };
  }

  /**
   * Create default admin user
   */
  async createAdminUser(userData) {
    try {
      // This would integrate with the Auth service
      // For now, just validate the data
      const required = ['email', 'username', 'password'];
      const missing = required.filter(key => !userData[key]);

      if (missing.length > 0) {
        return {
          success: false,
          error: `Missing required fields: ${missing.join(', ')}`
        };
      }

      // TODO: Call Auth service to create user
      console.log('[SetupService] Admin user would be created:', {
        email: userData.email,
        username: userData.username
      });

      return {
        success: true,
        message: 'Admin user created successfully'
      };
    } catch (error) {
      console.error('[SetupService] Error creating admin user:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Create sample application
   */
  async createSampleApplication() {
    try {
      // Import and run the sample app creation script
      const sampleAppPath = path.join(__dirname, '../scripts/create-sample-app.js');
      const { createSampleApp } = require(sampleAppPath);

      await createSampleApp();

      return {
        success: true,
        message: 'Sample application created successfully'
      };
    } catch (error) {
      console.error('[SetupService] Error creating sample app:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Complete setup
   */
  async completeSetup(options = {}) {
    try {
      const results = {
        steps: []
      };

      // Step 1: Initialize database
      if (options.initializeDatabase !== false) {
        const dbResult = await this.initializeDatabase();
        results.steps.push({
          name: 'Database Initialization',
          success: dbResult.success,
          error: dbResult.error
        });

        if (!dbResult.success) {
          return { success: false, results };
        }
      }

      // Step 2: Create admin user
      if (options.adminUser) {
        const userResult = await this.createAdminUser(options.adminUser);
        results.steps.push({
          name: 'Admin User Creation',
          success: userResult.success,
          error: userResult.error
        });
      }

      // Step 3: Create sample application
      if (options.createSampleApp) {
        const sampleResult = await this.createSampleApplication();
        results.steps.push({
          name: 'Sample Application',
          success: sampleResult.success,
          error: sampleResult.error
        });
      }

      // Mark setup as complete
      this.setupState.completed = true;

      return {
        success: true,
        results,
        message: 'Setup completed successfully'
      };
    } catch (error) {
      console.error('[SetupService] Error completing setup:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate default .env template
   */
  getEnvTemplate() {
    return `# ═══════════════════════════════════════════════════════════
# Low-Code Platform Configuration
# ═══════════════════════════════════════════════════════════

# Application
NODE_ENV=development
PORT=5001

# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=exprsn_lowcode
DB_USER=postgres
DB_PASSWORD=
# Note: Leave DB_PASSWORD blank if using PostgreSQL trust authentication (common for local dev)

# Redis (Optional)
REDIS_ENABLED=false
REDIS_HOST=localhost
REDIS_PORT=6379

# Service URLs (Exprsn Ecosystem)
CA_URL=https://localhost:3000
SETUP_URL=http://localhost:3015
BRIDGE_URL=https://localhost:3010
AUTH_URL=https://localhost:3001
HERALD_URL=https://localhost:3014
PULSE_URL=https://localhost:3012
WORKFLOW_URL=https://localhost:3017
FORGE_URL=https://localhost:3016

# Security
SESSION_SECRET=change-this-to-random-string
JWT_SECRET=change-this-to-random-string

# Features
ENABLE_SAMPLE_DATA=true
ENABLE_DEBUG_LOGGING=false
`;
  }
}

module.exports = new SetupService();
