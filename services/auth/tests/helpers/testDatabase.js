/**
 * Test Database Helpers
 *
 * Uses the application's OWN models (src/models) so tests and the supertest app
 * share one connection and one schema. The models define `schema: 'auth'`, so we
 * create that schema before syncing — otherwise the app would write to `auth.*`
 * while tests read a separate `public.*` (the original bug here). Passport
 * strategies are registered too (normally done in the module's init()).
 */

const passport = require('passport');

let sequelize;
let models;

/**
 * Initialize test database: connect, ensure the `auth` schema, sync all models,
 * and register passport strategies.
 */
async function setupTestDatabase() {
  const db = require('../../src/models');
  sequelize = db.sequelize;

  try {
    await sequelize.authenticate();
    console.log('Test database connection established');
  } catch (error) {
    console.error('Unable to connect to test database:', error.message);
    throw error;
  }

  // Models are schema-qualified ('auth'); start from a clean schema (drops
  // tables AND enum types so re-runs don't collide).
  await sequelize.query('DROP SCHEMA IF EXISTS "auth" CASCADE');
  await sequelize.query('CREATE SCHEMA "auth"');

  // Create all model tables. Sequelize's sync() does NOT topologically sort by
  // foreign-key dependencies (e.g. Group is defined before Organization but
  // references it), so retry pending models until the set stops shrinking.
  let pending = Object.values(sequelize.models);
  let lastCount = Infinity;
  while (pending.length && pending.length < lastCount) {
    lastCount = pending.length;
    const next = [];
    for (const model of pending) {
      try {
        await model.sync();
      } catch (err) {
        next.push(model);
      }
    }
    pending = next;
  }
  // Surface any genuine (non-ordering) failure.
  for (const model of pending) {
    await model.sync();
  }

  // Register passport strategies (local + any configured providers). The module
  // does this in init(); tests require the bare app, so do it here.
  require('../../src/config/passport')(passport);

  // Expose only the Sequelize model classes (drop sequelize/Sequelize/helpers).
  const { sequelize: _s, Sequelize: _S, initializeSystemData: _i, ...realModels } = db;
  models = realModels;

  return { sequelize, models };
}

/**
 * Clean up test database
 */
async function teardownTestDatabase() {
  if (sequelize) {
    await sequelize.close();
    console.log('Test database connection closed');
  }
}

/**
 * Clear all data from tables
 */
async function clearDatabase() {
  if (!models) return;

  for (const name of Object.keys(models)) {
    const model = models[name];
    if (model && typeof model.destroy === 'function') {
      await model.destroy({ where: {}, truncate: true, cascade: true });
    }
  }
}

/**
 * Create test user.
 *
 * Callers pass a ready-to-store `password` (already a bcrypt hash in the existing
 * suite). We map it to `passwordHash` and create with `hooks: false` so the
 * model's beforeCreate hash hook does NOT double-hash it — login then compares
 * the plaintext against the stored hash correctly.
 */
async function createTestUser(overrides = {}) {
  const bcrypt = require('bcrypt');
  const { v4: uuidv4 } = require('uuid');

  const { password, ...rest } = overrides;
  const passwordHash = password || (await bcrypt.hash('Test123!@#', 12));

  const defaultUser = {
    id: uuidv4(),
    email: `test-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`,
    displayName: 'Test User',
    emailVerified: true,
    mfaEnabled: false,
    loginAttempts: 0,
    status: 'active',
    ...rest,
    passwordHash
  };

  return models.User.create(defaultUser, { hooks: false });
}

/**
 * Create test organization.
 *
 * `Organization.ownerId` is NOT NULL — when the caller doesn't provide one,
 * create a throwaway owner user so direct org creation keeps working.
 */
async function createTestOrganization(overrides = {}) {
  const { v4: uuidv4 } = require('uuid');

  const defaultOrg = {
    id: uuidv4(),
    name: `Test Org ${Date.now()}`,
    slug: `test-org-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
    ...overrides
  };

  if (!defaultOrg.ownerId) {
    const owner = await createTestUser();
    defaultOrg.ownerId = owner.id;
  }

  return models.Organization.create(defaultOrg);
}

/**
 * Create test role.
 *
 * `Role.slug` is NOT NULL — default it from the name so tests can assert on
 * the slug matching the role name they passed.
 */
async function createTestRole(overrides = {}) {
  const { v4: uuidv4 } = require('uuid');

  const defaultRole = {
    id: uuidv4(),
    name: `test-role-${Date.now()}`,
    description: 'Test role',
    ...overrides
  };

  if (!defaultRole.slug) {
    defaultRole.slug = String(defaultRole.name).toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }

  return models.Role.create(defaultRole);
}

/**
 * Create test permission
 */
async function createTestPermission(overrides = {}) {
  const { v4: uuidv4 } = require('uuid');

  const defaultPermission = {
    id: uuidv4(),
    name: `test:permission:${Date.now()}`,
    description: 'Test permission',
    resource: 'test',
    action: 'read',
    ...overrides
  };

  return models.Permission.create(defaultPermission);
}

/**
 * Create test OAuth2 client
 */
async function createTestOAuth2Client(overrides = {}) {
  const { v4: uuidv4 } = require('uuid');

  const defaultClient = {
    id: uuidv4(),
    clientId: `test-client-${Date.now()}`,
    clientSecret: 'test-secret',
    name: 'Test Client',
    redirectUris: ['http://localhost:3000/callback'],
    grants: ['authorization_code', 'refresh_token'],
    ...overrides
  };

  return models.OAuth2Client.create(defaultClient);
}

module.exports = {
  setupTestDatabase,
  teardownTestDatabase,
  clearDatabase,
  createTestUser,
  createTestOrganization,
  createTestRole,
  createTestPermission,
  createTestOAuth2Client,
  getModels: () => models,
  getSequelize: () => sequelize,
};
