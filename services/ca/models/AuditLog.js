/**
 * ═══════════════════════════════════════════════════════════════════════
 * AuditLog Model - Comprehensive audit trail
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');
const nodeCrypto = require('crypto');

/**
 * Deterministic JSON serialization with recursively sorted object keys
 * Used to build the canonical content that gets hashed into the chain
 */
function canonicalStringify(value) {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value === undefined ? null : value);
  }
  if (value instanceof Date) {
    return JSON.stringify(value.toISOString());
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(',')}]`;
  }
  const keys = Object.keys(value).sort();
  return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalStringify(value[key])}`).join(',')}}`;
}

/**
 * Compute the tamper-evidence hash for an audit entry
 */
function computeEntryHash(entry) {
  const canonical = canonicalStringify({
    action: entry.action,
    userId: entry.userId || null,
    resource: {
      type: entry.resourceType || null,
      id: entry.resourceId || null
    },
    details: entry.details || {},
    timestamp: new Date(entry.createdAt).toISOString(),
    prevHash: entry.prevHash || null
  });

  return nodeCrypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

module.exports = (sequelize, DataTypes) => {
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'user_id',
      // BUG-056: no FK to ca.users — the principal is a platform/auth user id
      // (auth.users), never mirrored into ca.users (vestigial). Same reasoning
      // as Token.userId; see drift-allow.json 'ca cross-schema user refs'.
      comment: 'CA-local user who performed the action (NULL for system actions and non-CA-local principals — see details.principalUserId)'
    },
    action: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'Action type (e.g., certificate.create, token.validate, user.login)'
    },
    resourceType: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'resource_type',
      comment: 'Type of resource affected (e.g., certificate, token, user)'
    },
    resourceId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'resource_id',
      comment: 'ID of the affected resource'
    },
    status: {
      type: DataTypes.ENUM('success', 'failure', 'error'),
      allowNull: false,
      defaultValue: 'success'
    },
    severity: {
      type: DataTypes.ENUM('info', 'warning', 'error', 'critical'),
      allowNull: false,
      defaultValue: 'info'
    },
    message: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Human-readable description of the action'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      field: 'ip_address'
    },
    userAgent: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'user_agent'
    },
    requestId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'request_id',
      comment: 'Correlation ID for grouping related logs'
    },
    details: {
      type: DataTypes.JSONB,
      defaultValue: {},
      allowNull: true,
      comment: 'Additional structured data about the action'
    },
    changes: {
      type: DataTypes.JSONB,
      allowNull: true,
      comment: 'Before/after state for update operations'
    },
    prevHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'prev_hash',
      comment: 'entryHash of the previous audit log row (hash chain)'
    },
    entryHash: {
      type: DataTypes.STRING(64),
      allowNull: true,
      field: 'entry_hash',
      comment: 'SHA-256 over the canonical entry content + prevHash'
    },
    createdAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      field: 'created_at'
    }
  }, {
    tableName: 'audit_logs',
    timestamps: false, // Only track creation
    underscored: true,
    indexes: [
      { fields: ['user_id'] },
      { fields: ['action'] },
      { fields: ['resource_type'] },
      { fields: ['resource_id'] },
      { fields: ['status'] },
      { fields: ['severity'] },
      { fields: ['request_id'] },
      { fields: ['created_at'] }
    ]
  });

  // Class methods
  AuditLog.log = async function(data) {
    // Hash-chain each entry to its predecessor for tamper evidence.
    // A transaction with a row lock on the latest entry serializes
    // concurrent writers so the chain does not fork.
    // BUG-056: audit_logs.user_id FKs ca.users(id), but most principals on
    // the platform are AUTH users (auth.users) that are never mirrored into
    // ca.users — cross-schema FKs would violate per-schema isolation, and the
    // token subject being an auth id is a permanent design constraint (see
    // Token.userId, which had its FK dropped for the same reason). Write the
    // FK column only when the principal is CA-local; otherwise keep the id in
    // details.principalUserId so no audit value is lost. Resolved OUTSIDE the
    // chain transaction (a failed lookup must not abort it) and BEFORE the
    // entry hash is computed so the hash chain matches the stored row.
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    let resolvedUserId = data.userId || null;
    let resolvedDetails = data.details || {};
    if (resolvedUserId) {
      let caLocal = null;
      if (UUID_RE.test(String(resolvedUserId))) {
        try {
          const User = sequelize.models.User;
          caLocal = User
            ? await User.findByPk(resolvedUserId, { attributes: ['id'] })
            : null;
        } catch (_) {
          caLocal = null; // lookup failure — fail toward NULL, never toward FK violation
        }
      }
      if (!caLocal) {
        resolvedDetails = { ...resolvedDetails, principalUserId: resolvedUserId };
        resolvedUserId = null;
      }
    }

    return sequelize.transaction(async (transaction) => {
      const last = await this.findOne({
        order: [['createdAt', 'DESC']],
        transaction,
        lock: transaction.LOCK.UPDATE
      });

      const entry = {
        userId: resolvedUserId,
        action: data.action,
        resourceType: data.resourceType || null,
        resourceId: data.resourceId || null,
        status: data.status || 'success',
        severity: data.severity || 'info',
        message: data.message || null,
        ipAddress: data.ipAddress || null,
        userAgent: data.userAgent || null,
        requestId: data.requestId || null,
        details: resolvedDetails,
        changes: data.changes || null,
        createdAt: new Date(),
        prevHash: last ? last.entryHash : null
      };

      entry.entryHash = computeEntryHash(entry);

      return this.create(entry, { transaction });
    });
  };

  /**
   * Re-walk the hash chain and verify integrity
   * @param {number} [limit=1000] - Maximum number of most-recent rows to verify
   * @returns {Promise<Object>} { valid, checked, errors: [{ id, reason }] }
   */
  AuditLog.verifyChain = async function(limit = 1000) {
    // Fetch most-recent rows, then walk oldest -> newest
    const rows = await this.findAll({
      order: [['createdAt', 'DESC']],
      limit
    });
    rows.reverse();

    const errors = [];
    let previous = null;

    for (const row of rows) {
      // Rows written before chaining was introduced have no entryHash
      if (!row.entryHash) {
        previous = row;
        continue;
      }

      const expectedHash = computeEntryHash(row);
      if (expectedHash !== row.entryHash) {
        errors.push({ id: row.id, reason: 'ENTRY_HASH_MISMATCH' });
      }

      // Linkage check (skip for the first verified row of the window and
      // for rows following pre-chain legacy entries without a hash)
      if (previous && previous.entryHash && row.prevHash !== previous.entryHash) {
        errors.push({ id: row.id, reason: 'BROKEN_CHAIN_LINK' });
      }

      previous = row;
    }

    return {
      valid: errors.length === 0,
      checked: rows.length,
      errors
    };
  };

  return AuditLog;
};
