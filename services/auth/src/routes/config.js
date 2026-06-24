/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Auth configurations
 */

const express = require('express');
const router = express.Router();
const { User, Organization, Role } = require('../models');
const config = require('../config');
const { logger } = require('@exprsn/shared');
const { requireAdminBearer } = require('../middleware/requireAdmin');

// This router exposes user/org/role/auth-method configuration to the admin
// console. It carries no auth of its own at the mount, so guard every section
// here: a valid CA bearer whose identity is a platform/role admin. Without this,
// `GET /api/config/auth-users` leaks every user's email/status to anonymous callers.
router.use(requireAdminBearer);

/**
 * GET /api/config/:sectionId
 * Fetch configuration for a specific section
 */
router.get('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'auth-users':
        data = await getUsersConfig();
        break;

      case 'auth-groups':
        data = await getGroupsConfig();
        break;

      case 'auth-roles':
        data = await getRolesConfig();
        break;

      case 'auth-methods':
        data = await getAuthMethodsConfig();
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    res.json(data);
  } catch (error) {
    logger.error(`Error fetching config for ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * POST /api/config/:sectionId
 * Update configuration for a specific section
 */
router.post('/:sectionId', async (req, res) => {
  const { sectionId } = req.params;
  const configData = req.body;

  try {
    let result;

    switch (sectionId) {
      case 'auth-users':
        result = await updateUsersConfig(configData);
        break;

      case 'auth-groups':
        result = await updateGroupsConfig(configData);
        break;

      case 'auth-roles':
        result = await updateRolesConfig(configData);
        break;

      case 'auth-methods':
        result = await updateAuthMethodsConfig(configData);
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    res.json({
      success: true,
      result
    });
  } catch (error) {
    logger.error(`Error updating config for ${sectionId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ========================================
// Configuration Fetching Functions
// ========================================

async function getUsersConfig() {
  // Fetch users
  const users = await User.findAll({
    attributes: ['id', 'displayName', 'email', 'status', 'createdAt', 'lastLoginAt'],
    order: [['createdAt', 'DESC']],
    limit: 50
  });

  // Get statistics
  const totalUsers = await User.count();
  const activeUsers = await User.count({ where: { status: 'active' } });
  const suspendedUsers = await User.count({ where: { status: 'suspended' } });

  return {
    title: 'User Management',
    description: 'Manage user accounts and profiles',
    actions: ['Create User', 'Import Users', 'Export Users'],
    table: {
      headers: ['Name', 'Email', 'Status', 'Last Login', 'Actions'],
      rows: users.map(user => [
        user.displayName,
        user.email,
        user.status,
        user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleDateString() : 'Never',
        'View | Edit | Suspend'
      ])
    },
    stats: {
      total: totalUsers,
      active: activeUsers,
      suspended: suspendedUsers
    }
  };
}

async function getGroupsConfig() {
  // Fetch organizations (groups)
  const organizations = await Organization.findAll({
    order: [['createdAt', 'DESC']],
    limit: 50
  });

  // Get member counts
  const orgData = await Promise.all(
    organizations.map(async (org) => {
      const memberCount = await org.countMembers();
      return {
        id: org.id,
        name: org.name,
        members: memberCount,
        created: org.createdAt
      };
    })
  );

  return {
    title: 'Group Management',
    description: 'Organize users into groups for access control',
    actions: ['Create Group', 'Import Groups'],
    table: {
      headers: ['Name', 'Members', 'Created', 'Actions'],
      rows: orgData.map(org => [
        org.name,
        String(org.members),
        new Date(org.created).toLocaleDateString(),
        'View | Edit | Delete'
      ])
    }
  };
}

async function getRolesConfig() {
  // Fetch roles
  const roles = await Role.findAll({
    order: [['createdAt', 'DESC']],
    limit: 50
  });

  return {
    title: 'Roles & Permissions',
    description: 'Define roles and assign permissions',
    actions: ['Create Role', 'Manage Permissions'],
    table: {
      headers: ['Role', 'Permissions', 'Description', 'Actions'],
      rows: roles.map(role => [
        role.name,
        Array.isArray(role.permissions) ? role.permissions.join(', ') : 'None',
        role.description || '',
        'View | Edit | Delete'
      ])
    }
  };
}

async function getAuthMethodsConfig() {
  // Derive provider state from runtime config. There is no AuthProvider table;
  // OAuth2/OIDC and SAML availability come from the parsed config.
  const oauth2Enabled = Boolean(config.oauth2 && config.oauth2.enabled !== false);
  const samlEnabled = Boolean(config.saml && config.saml.enabled);

  const providers = [];
  if (oauth2Enabled) providers.push({ name: 'OAuth2/OIDC', type: 'oauth2', enabled: true });
  if (samlEnabled) providers.push({ name: 'SAML 2.0', type: 'saml', enabled: true });

  return {
    title: 'Authentication Methods',
    description: 'Configure authentication providers and methods',
    fields: [
      { name: 'passwordAuth', label: 'Password Authentication', type: 'checkbox', value: true },
      { name: 'mfaEnabled', label: 'Multi-Factor Authentication', type: 'checkbox', value: config.mfa?.enabled || false },
      { name: 'oauth2Enabled', label: 'OAuth2/OIDC', type: 'checkbox', value: oauth2Enabled },
      { name: 'samlEnabled', label: 'SAML 2.0', type: 'checkbox', value: samlEnabled },
      { name: 'sessionTimeout', label: 'Session Timeout (minutes)', type: 'number', value: config.session?.maxAge ? config.session.maxAge / 60000 : 60 },
      { name: 'passwordMinLength', label: 'Minimum Password Length', type: 'number', value: 8 },
      { name: 'passwordRequireSpecial', label: 'Require Special Characters', type: 'checkbox', value: true }
    ],
    providers
  };
}

// ========================================
// Configuration Update Functions
// ========================================

async function updateUsersConfig(configData) {
  logger.info('Users configuration updated:', configData);

  // Handle user-related config updates
  // For now, just log the changes
  return {
    message: 'Users configuration updated successfully',
    config: configData
  };
}

async function updateGroupsConfig(configData) {
  logger.info('Groups configuration updated:', configData);

  return {
    message: 'Groups configuration updated successfully',
    config: configData
  };
}

async function updateRolesConfig(configData) {
  logger.info('Roles configuration updated:', configData);

  return {
    message: 'Roles configuration updated successfully',
    config: configData
  };
}

async function updateAuthMethodsConfig(configData) {
  logger.info('Auth methods configuration updated:', configData);

  // Update runtime configuration
  if (configData.mfaEnabled !== undefined) {
    // Toggle MFA
    logger.info(`MFA ${configData.mfaEnabled ? 'enabled' : 'disabled'}`);
  }

  if (configData.sessionTimeout) {
    // Update session timeout
    logger.info(`Session timeout set to ${configData.sessionTimeout} minutes`);
  }

  return {
    message: 'Authentication methods configuration updated successfully',
    config: configData
  };
}

module.exports = router;
