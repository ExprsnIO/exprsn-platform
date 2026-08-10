const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Lease = sequelize.define('Lease', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    leaseId: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'External lease identifier'
    },
    secretType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Type of dynamic secret (database, api_key, ssh_key, tls_cert)'
    },
    secretPath: {
      type: DataTypes.STRING(500),
      allowNull: false,
      comment: 'Path to the secret configuration'
    },
    credentialData: {
      type: DataTypes.JSONB,
      allowNull: false,
      comment: 'Encrypted dynamic secret data'
    },
    encryptionKeyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'encryption_keys',
        key: 'id'
      },
      comment: 'Key used to encrypt credential data'
    },
    ttl: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Time to live in seconds'
    },
    renewable: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
      allowNull: false,
      comment: 'Whether the lease can be renewed'
    },
    maxTTL: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Maximum TTL if renewable (seconds)'
    },
    renewCount: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
      allowNull: false,
      comment: 'Number of times renewed'
    },
    lastRenewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Last renewal timestamp'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      comment: 'Lease expiration timestamp'
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'User or service that created the lease'
    },
    status: {
      type: DataTypes.ENUM('active', 'expired', 'revoked'),
      defaultValue: 'active',
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional metadata'
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Revocation timestamp'
    },
    revokedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'User or service that revoked the lease'
    }
  }, {
    tableName: 'leases',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['lease_id'],
        unique: true
      },
      {
        fields: ['secret_type']
      },
      {
        fields: ['status']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['created_by']
      },
      {
        fields: ['secret_path']
      },
      {
        fields: ['encryption_key_id']
      }
    ]
  });

  Lease.associate = (models) => {
    Lease.belongsTo(models.EncryptionKey, {
      foreignKey: 'encryptionKeyId',
      as: 'encryptionKey'
    });
    Lease.hasMany(models.AuditLog, {
      foreignKey: 'resourceId',
      as: 'auditLogs'
    });
  };

  return Lease;
};
