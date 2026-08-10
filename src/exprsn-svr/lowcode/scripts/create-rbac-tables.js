/**
 * Create RBAC Tables
 * Run this script to create the RBAC tables in the database
 */

const { sequelize, AppRole, AppPermission, AppUserRole } = require('../models');

async function createTables() {
  try {
    console.log('[RBAC] Creating RBAC tables...');

    // Test connection
    await sequelize.authenticate();
    console.log('[RBAC] Database connection established');

    // Create tables (uses the models we defined)
    await AppRole.sync({ alter: true });
    console.log('[RBAC] ✓ app_roles table created/updated');

    await AppPermission.sync({ alter: true });
    console.log('[RBAC] ✓ app_permissions table created/updated');

    await AppUserRole.sync({ alter: true });
    console.log('[RBAC] ✓ app_user_roles table created/updated');

    console.log('[RBAC] All RBAC tables created successfully!');

    process.exit(0);
  } catch (error) {
    console.error('[RBAC] Error creating tables:', error);
    process.exit(1);
  }
}

createTables();
