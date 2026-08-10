/**
 * VaultToken Model
 * Manages Vault access tokens with granular permissions
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const VaultToken = sequelize.define('VaultToken', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    tokenId: {
      type: DataTypes.STRING(64),
      unique: true,
      allowNull: false,
      comment: 'Unique token identifier (prefix: vt_)'
    },
    tokenHash: {
      type: DataTypes.STRING(256),
      allowNull: false,
      comment: 'SHA-256 hash of the actual token value'
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Human-readable token name'
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Ownership
    entityType: {
      type: DataTypes.ENUM('user', 'group', 'organization', 'service', 'certificate'),
      allowNull: false,
      comment: 'Type of entity that owns this token'
    },
    entityId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'ID of the owning entity (user ID, group ID, org ID, etc.)'
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: false
    },

    // Permissions - JSON object with granular permissions
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: {},
      comment: 'Granular permissions: { secrets: { read: true, write: false }, keys: { read: true } }'
    },

    // Scope restrictions
    pathPrefixes: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: 'Allowed path prefixes (e.g., ["/app1/*", "/shared/*"])'
    },
    ipWhitelist: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      comment: 'IP addresses/CIDR blocks allowed to use this token'
    },

    // Expiration
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Token expiration timestamp'
    },
    maxUses: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Maximum number of times this token can be used'
    },
    usageCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false
    },

    // Status
    status: {
      type: DataTypes.ENUM('active', 'revoked', 'expired', 'suspended'),
      defaultValue: 'active',
      allowNull: false
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    revokedBy: {
      type: DataTypes.STRING(255),
      allowNull: true
    },
    revocationReason: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Integration
    caTokenId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Associated CA token ID for integration'
    },
    authSessionId: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Associated Auth session ID'
    },

    // AI & Analytics
    riskScore: {
      type: DataTypes.FLOAT,
      defaultValue: 0.0,
      comment: 'AI-calculated risk score (0-1)'
    },
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },
    lastUsedFrom: {
      type: DataTypes.STRING(100),
      allowNull: true,
      comment: 'Last IP address used from'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional custom metadata'
    }
  }, {
    tableName: 'vault_tokens',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['token_id'], unique: true },
      { fields: ['token_hash'] },
      { fields: ['entity_type', 'entity_id'] },
      { fields: ['status'] },
      { fields: ['expires_at'] },
      { fields: ['created_by'] },
      { fields: ['ca_token_id'] }
    ]
  });

  VaultToken.associate = (models) => {
    VaultToken.hasMany(models.TokenBinding, {
      foreignKey: 'tokenId',
      as: 'bindings'
    });
  };

  return VaultToken;
};
