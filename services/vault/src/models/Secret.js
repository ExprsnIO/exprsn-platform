const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Secret = sequelize.define('Secret', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    path: {
      type: DataTypes.STRING(500),
      allowNull: false,
      unique: true,
      comment: 'Hierarchical path like /app/database/password'
    },
    key: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Secret key name'
    },
    encryptedValue: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'AES-256-GCM encrypted secret value'
    },
    encryptionKeyId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'encryption_keys',
        key: 'id'
      },
      comment: 'Key used to encrypt this secret'
    },
    iv: {
      type: DataTypes.STRING(32),
      allowNull: false,
      comment: 'Initialization vector for AES-GCM'
    },
    authTag: {
      type: DataTypes.STRING(32),
      allowNull: false,
      comment: 'Authentication tag for AES-GCM'
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
      comment: 'Secret version number'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional metadata (tags, description, etc.)'
    },
    rotationPolicy: {
      type: DataTypes.JSONB,
      defaultValue: null,
      comment: 'Rotation schedule and policy'
    },
    lastRotatedAt: {
      type: DataTypes.DATE,
      defaultValue: null,
      comment: 'Last rotation timestamp'
    },
    expiresAt: {
      type: DataTypes.DATE,
      defaultValue: null,
      comment: 'Optional expiration date'
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'User or service that created the secret'
    },
    updatedBy: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'User or service that last updated the secret'
    },
    status: {
      type: DataTypes.ENUM('active', 'deprecated', 'deleted'),
      defaultValue: 'active',
      allowNull: false
    }
  }, {
    tableName: 'secrets',
    timestamps: true,
    underscored: true,
    paranoid: true, // Soft deletes
    indexes: [
      {
        fields: ['path'],
        unique: true,
        where: {
          deleted_at: null
        }
      },
      {
        fields: ['encryption_key_id']
      },
      {
        fields: ['status']
      },
      {
        fields: ['created_at']
      },
      {
        fields: ['expires_at']
      }
    ]
  });

  Secret.associate = (models) => {
    Secret.belongsTo(models.EncryptionKey, {
      foreignKey: 'encryptionKeyId',
      as: 'encryptionKey'
    });
    Secret.hasMany(models.AuditLog, {
      foreignKey: 'resourceId',
      as: 'auditLogs'
    });
  };

  return Secret;
};
