#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════
 * User Migration Script: CA → Auth Service
 * Migrates existing users from CA database to Auth service
 * ═══════════════════════════════════════════════════════════
 */

const path = require('path');
const axios = require('axios');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '../.env') });

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warning: (msg) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  step: (msg) => console.log(`${colors.cyan}→${colors.reset} ${msg}`)
};

// Configuration
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const CA_DATABASE_URL = process.env.CA_DATABASE_URL || process.env.DATABASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_PASSWORDS = process.argv.includes('--skip-passwords');

// Migration statistics
const stats = {
  total: 0,
  migrated: 0,
  skipped: 0,
  failed: 0,
  errors: []
};

/**
 * Initialize database connection for CA
 */
async function initCADatabase() {
  const { Sequelize } = require('sequelize');

  const sequelize = new Sequelize(CA_DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000
    }
  });

  try {
    await sequelize.authenticate();
    log.success('Connected to CA database');

    // Define minimal User model for reading
    const User = sequelize.define('User', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true
      },
      email: Sequelize.STRING,
      username: Sequelize.STRING,
      password: Sequelize.STRING,
      firstName: Sequelize.STRING,
      lastName: Sequelize.STRING,
      displayName: Sequelize.STRING,
      phone: Sequelize.STRING,
      status: Sequelize.STRING,
      emailVerified: Sequelize.BOOLEAN,
      twoFactorEnabled: Sequelize.BOOLEAN,
      lastLoginAt: Sequelize.DATE,
      lastLoginIp: Sequelize.STRING,
      createdAt: Sequelize.DATE,
      updatedAt: Sequelize.DATE
    }, {
      tableName: 'users',
      timestamps: true,
      underscored: true
    });

    // Define Role model
    const Role = sequelize.define('Role', {
      id: {
        type: Sequelize.UUID,
        primaryKey: true
      },
      name: Sequelize.STRING,
      description: Sequelize.STRING
    }, {
      tableName: 'roles',
      timestamps: true,
      underscored: true
    });

    // Define UserRole junction table
    const UserRole = sequelize.define('UserRole', {
      userId: {
        type: Sequelize.UUID,
        references: {
          model: 'users',
          key: 'id'
        }
      },
      roleId: {
        type: Sequelize.UUID,
        references: {
          model: 'roles',
          key: 'id'
        }
      }
    }, {
      tableName: 'user_roles',
      timestamps: false,
      underscored: true
    });

    // Set up associations
    User.belongsToMany(Role, { through: UserRole, foreignKey: 'userId', as: 'roles' });
    Role.belongsToMany(User, { through: UserRole, foreignKey: 'roleId', as: 'users' });

    return { sequelize, User, Role, UserRole };
  } catch (error) {
    log.error(`Failed to connect to CA database: ${error.message}`);
    throw error;
  }
}

/**
 * Get service token for Auth API
 */
async function getServiceToken() {
  try {
    const response = await axios.post(
      `${AUTH_SERVICE_URL}/api/auth/service-token`,
      {
        serviceName: 'exprsn-ca',
        serviceId: 'migration-script'
      },
      {
        headers: {
          'X-Service-Key': process.env.SERVICE_KEY || process.env.CA_SERVICE_KEY,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    if (response.data && response.data.success) {
      return response.data.token;
    } else {
      throw new Error('Failed to obtain service token');
    }
  } catch (error) {
    log.error(`Failed to get service token: ${error.message}`);
    throw error;
  }
}

/**
 * Check if user exists in Auth service
 */
async function userExistsInAuth(email, serviceToken) {
  try {
    const response = await axios.get(
      `${AUTH_SERVICE_URL}/api/users/by-email/${encodeURIComponent(email)}`,
      {
        headers: {
          'Authorization': `Bearer ${serviceToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      }
    );

    return response.data && response.data.success;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      return false;
    }
    throw error;
  }
}

/**
 * Migrate single user to Auth service
 */
async function migrateUser(user, serviceToken) {
  try {
    // Check if user already exists
    const exists = await userExistsInAuth(user.email, serviceToken);

    if (exists) {
      log.warning(`User already exists in Auth: ${user.email}`);
      stats.skipped++;
      return { success: true, skipped: true };
    }

    // Prepare user data for Auth service
    const userData = {
      email: user.email,
      username: user.username,
      firstName: user.firstName || '',
      lastName: user.lastName || '',
      displayName: user.displayName || `${user.firstName} ${user.lastName}`,
      phone: user.phone || null,
      status: user.status || 'active',
      emailVerified: user.emailVerified || false,
      twoFactorEnabled: user.twoFactorEnabled || false,
      source: 'ca_migration',
      sourceId: user.id,
      metadata: {
        migratedFrom: 'exprsn-ca',
        migratedAt: new Date().toISOString(),
        originalUserId: user.id,
        lastLoginAt: user.lastLoginAt,
        lastLoginIp: user.lastLoginIp
      }
    };

    // Include password hash if not skipping passwords
    if (!SKIP_PASSWORDS && user.password) {
      userData.passwordHash = user.password; // Already hashed in CA database
    }

    if (DRY_RUN) {
      log.info(`[DRY RUN] Would migrate user: ${user.email}`);
      stats.migrated++;
      return { success: true, dryRun: true };
    }

    // Create user in Auth service
    const response = await axios.post(
      `${AUTH_SERVICE_URL}/api/admin/users`,
      userData,
      {
        headers: {
          'Authorization': `Bearer ${serviceToken}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      }
    );

    if (response.data && response.data.success) {
      log.success(`Migrated user: ${user.email}`);
      stats.migrated++;

      // Migrate roles if any
      if (user.roles && user.roles.length > 0) {
        await migrateUserRoles(user.email, user.roles, response.data.user.id, serviceToken);
      }

      return { success: true, userId: response.data.user.id };
    } else {
      throw new Error(response.data?.message || 'Failed to create user');
    }
  } catch (error) {
    log.error(`Failed to migrate user ${user.email}: ${error.message}`);
    stats.failed++;
    stats.errors.push({
      email: user.email,
      error: error.message
    });
    return { success: false, error: error.message };
  }
}

/**
 * Migrate user roles
 */
async function migrateUserRoles(email, roles, newUserId, serviceToken) {
  try {
    for (const role of roles) {
      // Map CA role names to Auth role names
      const roleMapping = {
        'admin': 'admin',
        'user': 'user',
        'moderator': 'moderator',
        'system_admin': 'system_admin'
      };

      const authRoleName = roleMapping[role.name] || role.name;

      if (DRY_RUN) {
        log.info(`[DRY RUN] Would assign role ${authRoleName} to user ${email}`);
        continue;
      }

      // Get role ID from Auth service
      const rolesResponse = await axios.get(
        `${AUTH_SERVICE_URL}/api/roles?name=${authRoleName}`,
        {
          headers: {
            'Authorization': `Bearer ${serviceToken}`,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      if (rolesResponse.data?.success && rolesResponse.data.roles?.length > 0) {
        const authRole = rolesResponse.data.roles[0];

        // Assign role to user
        await axios.post(
          `${AUTH_SERVICE_URL}/api/users/${newUserId}/roles`,
          { roleId: authRole.id },
          {
            headers: {
              'Authorization': `Bearer ${serviceToken}`,
              'Content-Type': 'application/json'
            },
            timeout: 10000
          }
        );

        log.success(`  ├─ Assigned role: ${authRoleName}`);
      }
    }
  } catch (error) {
    log.warning(`  ├─ Failed to migrate roles: ${error.message}`);
  }
}

/**
 * Validate migration prerequisites
 */
async function validatePrerequisites() {
  log.step('Validating prerequisites...');

  // Check Auth service availability
  try {
    const response = await axios.get(`${AUTH_SERVICE_URL}/health`, { timeout: 5000 });
    if (response.status === 200) {
      log.success('Auth service is available');
    } else {
      throw new Error('Auth service returned unexpected status');
    }
  } catch (error) {
    log.error('Auth service is not available');
    throw new Error('Auth service must be running before migration');
  }

  // Check CA database connection
  if (!CA_DATABASE_URL) {
    throw new Error('CA_DATABASE_URL environment variable is not set');
  }

  log.success('Prerequisites validated');
}

/**
 * Generate migration report
 */
function generateReport() {
  console.log('\n' + '═'.repeat(60));
  console.log(`${colors.bright}Migration Report${colors.reset}`);
  console.log('═'.repeat(60));
  console.log(`Total users:     ${colors.cyan}${stats.total}${colors.reset}`);
  console.log(`Migrated:        ${colors.green}${stats.migrated}${colors.reset}`);
  console.log(`Skipped:         ${colors.yellow}${stats.skipped}${colors.reset}`);
  console.log(`Failed:          ${colors.red}${stats.failed}${colors.reset}`);
  console.log('═'.repeat(60));

  if (stats.errors.length > 0) {
    console.log(`\n${colors.red}Errors:${colors.reset}`);
    stats.errors.forEach((err, idx) => {
      console.log(`  ${idx + 1}. ${err.email}: ${err.error}`);
    });
  }

  if (DRY_RUN) {
    console.log(`\n${colors.yellow}This was a DRY RUN - no changes were made${colors.reset}`);
  }
}

/**
 * Main migration function
 */
async function main() {
  console.log(`\n${colors.bright}CA → Auth User Migration Script${colors.reset}\n`);

  if (DRY_RUN) {
    log.warning('Running in DRY RUN mode - no changes will be made');
  }

  if (SKIP_PASSWORDS) {
    log.warning('Skipping password migration - users will need to reset passwords');
  }

  try {
    // Validate prerequisites
    await validatePrerequisites();

    // Initialize CA database
    log.step('Connecting to CA database...');
    const { sequelize, User } = await initCADatabase();

    // Get service token
    log.step('Obtaining service token...');
    const serviceToken = await getServiceToken();
    log.success('Service token obtained');

    // Fetch all users from CA
    log.step('Fetching users from CA database...');
    const users = await User.findAll({
      include: [{ association: 'roles' }]
    });

    stats.total = users.length;
    log.info(`Found ${stats.total} users to migrate`);

    if (stats.total === 0) {
      log.warning('No users found to migrate');
      await sequelize.close();
      return;
    }

    // Migrate users
    log.step('Starting migration...\n');

    for (let i = 0; i < users.length; i++) {
      const user = users[i];
      log.info(`[${i + 1}/${users.length}] Processing: ${user.email}`);
      await migrateUser(user, serviceToken);
    }

    // Close database connection
    await sequelize.close();

    // Generate report
    console.log('');
    generateReport();

    // Exit with appropriate code
    if (stats.failed > 0) {
      log.error('\nMigration completed with errors');
      process.exit(1);
    } else {
      log.success('\nMigration completed successfully');
      process.exit(0);
    }
  } catch (error) {
    log.error(`\nMigration failed: ${error.message}`);
    console.error(error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  main();
}

module.exports = { main };
