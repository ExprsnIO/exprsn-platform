const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EncryptionKey = sequelize.define('EncryptionKey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'Human-readable key name'
    },
    algorithm: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: 'AES-256-GCM',
      comment: 'Encryption algorithm'
    },
    encryptedKey: {
      type: DataTypes.TEXT,
      allowNull: false,
      comment: 'Master key encrypted data encryption key'
    },
    keyDerivation: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'KDF parameters (algorithm, salt, iterations)'
    },
    version: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
      allowNull: false,
      comment: 'Key version for rotation'
    },
    purpose: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'general',
      comment: 'Key purpose (general, transit, signing, etc.)'
    },
    rotationSchedule: {
      type: DataTypes.JSONB,
      defaultValue: null,
      comment: 'Automatic rotation schedule'
    },
    lastRotatedAt: {
      type: DataTypes.DATE,
      defaultValue: null,
      comment: 'Last rotation timestamp'
    },
    expiresAt: {
      type: DataTypes.DATE,
      defaultValue: null,
      comment: 'Key expiration date'
    },
    createdBy: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'User or service that created the key'
    },
    status: {
      type: DataTypes.ENUM('active', 'rotating', 'deprecated', 'revoked'),
      defaultValue: 'active',
      allowNull: false
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional metadata'
    }
  }, {
    tableName: 'encryption_keys',
    timestamps: true,
    underscored: true,
    paranoid: true,
    indexes: [
      {
        fields: ['name'],
        unique: true,
        where: {
          deleted_at: null
        }
      },
      {
        fields: ['status']
      },
      {
        fields: ['purpose']
      },
      {
        fields: ['expires_at']
      },
      {
        fields: ['created_at']
      }
    ]
  });

  EncryptionKey.associate = (models) => {
    EncryptionKey.hasMany(models.Secret, {
      foreignKey: 'encryptionKeyId',
      as: 'secrets'
    });
    EncryptionKey.hasMany(models.AuditLog, {
      foreignKey: 'resourceId',
      as: 'auditLogs'
    });
  };

  return EncryptionKey;
};
