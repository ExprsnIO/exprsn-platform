/**
 * Configuration Management Routes
 * Provides endpoints for the Setup dashboard to manage Vault configurations
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { requireRead, requireWrite } = require('../middleware/auth');
const { VaultConfig } = require('../models');

/**
 * Persisted section settings (TASK-039). Row data wins over the env-derived
 * field defaults; unknown keys are dropped at write time so junk isn't stored.
 */
async function storedSection(sectionId) {
  try {
    const row = await VaultConfig.findByPk(sectionId);
    return (row && row.data) || {};
  } catch (error) {
    logger.error(`Failed to load stored config for ${sectionId}: ${error.message}`);
    return {};
  }
}

/** Overlay persisted values onto a section's env-derived `fields` array. */
function overlayStored(section, stored) {
  if (Array.isArray(section.fields)) {
    for (const field of section.fields) {
      if (Object.prototype.hasOwnProperty.call(stored, field.name)) {
        field.value = stored[field.name];
      }
    }
  }
  return section;
}

// Configuration endpoints expose and mutate Vault settings. CA tokens have no
// "admin" permission (the model is read/write/append/delete/update), so gate by
// operation: reads require `read`, writes require `write`. Both are scoped to
// the /config resource prefix.

/**
 * GET /api/config/:sectionId
 * Fetch configuration for a specific section
 */
router.get('/:sectionId', ...requireRead('/config'), async (req, res) => {
  const { sectionId } = req.params;

  try {
    let data;

    switch (sectionId) {
      case 'vault':
      case 'vault-secrets':
        data = await getSecretsConfig();
        break;

      case 'vault-encryption':
        data = await getEncryptionConfig();
        break;

      case 'vault-access':
        data = await getAccessConfig();
        break;

      case 'vault-audit':
        data = await getAuditConfig();
        break;

      default:
        return res.status(404).json({
          success: false,
          error: 'Configuration section not found'
        });
    }

    const canonical = sectionId === 'vault' ? 'vault-secrets' : sectionId;
    res.json(overlayStored(data, await storedSection(canonical)));
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
router.post('/:sectionId', ...requireWrite('/config'), async (req, res) => {
  const { sectionId } = req.params;
  const configData = req.body;

  try {
    let result;

    switch (sectionId) {
      case 'vault':
      case 'vault-secrets':
        result = await updateSection('vault-secrets', configData);
        break;

      case 'vault-encryption':
        result = await updateSection('vault-encryption', configData);
        break;

      case 'vault-access':
        result = await updateSection('vault-access', configData);
        break;

      case 'vault-audit':
        result = await updateSection('vault-audit', configData);
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

async function getSecretsConfig() {
  return {
    title: 'Secrets Management',
    description: 'Manage application secrets and credentials',
    stats: {
      totalSecrets: 0,
      activeSecrets: 0,
      expiring: 0
    },
    actions: ['Create Secret', 'Import Secrets', 'Rotate All'],
    table: {
      headers: ['Name', 'Type', 'Last Accessed', 'Expires', 'Actions'],
      rows: []
    },
    fields: [
      { name: 'enableRotation', label: 'Enable Auto-Rotation', type: 'checkbox', value: process.env.VAULT_AUTO_ROTATE === 'true' },
      { name: 'rotationInterval', label: 'Rotation Interval (days)', type: 'number', value: parseInt(process.env.VAULT_ROTATION_DAYS) || 90 },
      { name: 'enableExpiry', label: 'Enable Secret Expiry', type: 'checkbox', value: process.env.VAULT_ENABLE_EXPIRY === 'true' },
      { name: 'defaultExpiry', label: 'Default Expiry (days)', type: 'number', value: parseInt(process.env.VAULT_DEFAULT_EXPIRY) || 365 }
    ]
  };
}

async function getEncryptionConfig() {
  return {
    title: 'Encryption Configuration',
    description: 'Configure encryption methods and key management',
    fields: [
      { name: 'algorithm', label: 'Encryption Algorithm', type: 'select', options: ['AES-256-GCM', 'AES-256-CBC', 'ChaCha20-Poly1305'], value: process.env.VAULT_ALGORITHM || 'AES-256-GCM' },
      { name: 'keyDerivation', label: 'Key Derivation', type: 'select', options: ['PBKDF2', 'scrypt', 'argon2'], value: process.env.VAULT_KDF || 'PBKDF2' },
      { name: 'iterations', label: 'KDF Iterations', type: 'number', value: parseInt(process.env.VAULT_KDF_ITERATIONS) || 100000 },
      { name: 'enableHSM', label: 'Enable Hardware Security Module', type: 'checkbox', value: process.env.VAULT_ENABLE_HSM === 'true' },
      { name: 'masterKeyRotation', label: 'Master Key Rotation (days)', type: 'number', value: parseInt(process.env.VAULT_MASTER_KEY_ROTATION) || 365 }
    ]
  };
}

async function getAccessConfig() {
  return {
    title: 'Access Control',
    description: 'Configure access policies and permissions',
    fields: [
      { name: 'enableRBAC', label: 'Enable Role-Based Access Control', type: 'checkbox', value: process.env.VAULT_ENABLE_RBAC !== 'false' },
      { name: 'requireMFA', label: 'Require MFA for Admin Access', type: 'checkbox', value: process.env.VAULT_REQUIRE_MFA === 'true' },
      { name: 'sessionTimeout', label: 'Session Timeout (minutes)', type: 'number', value: parseInt(process.env.VAULT_SESSION_TIMEOUT) || 15 },
      { name: 'maxAttempts', label: 'Max Failed Attempts', type: 'number', value: parseInt(process.env.VAULT_MAX_ATTEMPTS) || 3 },
      { name: 'lockoutDuration', label: 'Lockout Duration (minutes)', type: 'number', value: parseInt(process.env.VAULT_LOCKOUT_DURATION) || 30 }
    ],
    table: {
      headers: ['User/Service', 'Role', 'Permissions', 'Last Access', 'Actions'],
      rows: []
    }
  };
}

async function getAuditConfig() {
  return {
    title: 'Audit & Compliance',
    description: 'Configure audit logging and compliance settings',
    fields: [
      { name: 'enableAudit', label: 'Enable Audit Logging', type: 'checkbox', value: process.env.VAULT_ENABLE_AUDIT !== 'false' },
      { name: 'logLevel', label: 'Audit Log Level', type: 'select', options: ['minimal', 'standard', 'detailed'], value: process.env.VAULT_AUDIT_LEVEL || 'standard' },
      { name: 'retention', label: 'Log Retention (days)', type: 'number', value: parseInt(process.env.VAULT_AUDIT_RETENTION) || 365 },
      { name: 'enableSIEM', label: 'Enable SIEM Integration', type: 'checkbox', value: process.env.VAULT_ENABLE_SIEM === 'true' },
      { name: 'siemEndpoint', label: 'SIEM Endpoint', type: 'text', value: process.env.VAULT_SIEM_ENDPOINT || '' },
      { name: 'complianceMode', label: 'Compliance Mode', type: 'select', options: ['none', 'pci-dss', 'hipaa', 'soc2'], value: process.env.VAULT_COMPLIANCE_MODE || 'none' }
    ]
  };
}

// ========================================
// Configuration Update Functions
// ========================================

/**
 * Allowed keys per section — derived from each section's `fields` list above.
 * Writes persist to vault_config (VaultConfig model); previously these
 * handlers logged-and-echoed without persisting anything (TASK-039).
 */
const SECTION_FIELDS = {
  'vault-secrets': ['enableRotation', 'rotationInterval', 'enableExpiry', 'defaultExpiry'],
  'vault-encryption': ['algorithm', 'keyDerivation', 'iterations', 'enableHSM', 'masterKeyRotation'],
  'vault-access': ['enableRBAC', 'requireMFA', 'sessionTimeout', 'maxAttempts', 'lockoutDuration'],
  'vault-audit': ['enableAudit', 'logLevel', 'retention', 'enableSIEM', 'siemEndpoint', 'complianceMode']
};

async function updateSection(sectionId, configData) {
  const allowed = SECTION_FIELDS[sectionId];
  // ConfigSectionEditor round-trips the whole schema ({ fields: [...] });
  // accept either that or a flat key/value object.
  const flat = Array.isArray(configData && configData.fields)
    ? Object.fromEntries(configData.fields.map((f) => [f.name, f.value]))
    : configData;
  const stored = await storedSection(sectionId);
  const clean = { ...stored };
  const rejected = [];
  for (const [key, value] of Object.entries(flat || {})) {
    if (allowed.includes(key)) {
      clean[key] = value;
    } else {
      rejected.push(key);
    }
  }
  await VaultConfig.upsert({ section: sectionId, data: clean });
  logger.info(`Vault config section ${sectionId} saved`, {
    keys: Object.keys(clean),
    ...(rejected.length ? { rejected } : {})
  });
  return {
    message: 'Configuration saved',
    config: clean,
    ...(rejected.length ? { rejectedKeys: rejected } : {})
  };
}

module.exports = router;
