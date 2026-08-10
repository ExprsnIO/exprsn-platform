/**
 * ═══════════════════════════════════════════════════════════
 * EncryptionKey Model
 * User encryption keys for End-to-End Encryption (E2EE)
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const EncryptionKey = sequelize.define('EncryptionKey', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    // User who owns this key
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    // Device identifier (allows multiple keys per user)
    deviceId: {
      type: DataTypes.STRING(255),
      allowNull: false
    },

    // RSA public key (PEM format)
    publicKey: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    // Private key encrypted with user's password (AES-256-GCM)
    encryptedPrivateKey: {
      type: DataTypes.TEXT,
      allowNull: false
    },

    // SHA-256 hash of public key for verification
    keyFingerprint: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true
    },

    // Key algorithm type
    keyType: {
      type: DataTypes.ENUM('rsa-4096'),
      defaultValue: 'rsa-4096',
      allowNull: false
    },

    // Whether this key is currently active
    active: {
      type: DataTypes.BOOLEAN,
      defaultValue: true
    },

    // Last time this key was used for encryption/decryption
    lastUsedAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // Optional expiration date (recommend 1 year)
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true
    },

    // Metadata for additional info
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'encryption_keys',
    timestamps: true,
    indexes: [
      { fields: ['userId'] },
      { fields: ['deviceId'] },
      { fields: ['keyFingerprint'], unique: true },
      { fields: ['active'] },
      { fields: ['userId', 'deviceId'] },
      { fields: ['userId', 'active'] },
      { fields: ['expiresAt'] }
    ],
    hooks: {
      // Automatically deactivate expired keys
      beforeFind(options) {
        if (!options.where) {
          options.where = {};
        }
        // Don't include expired keys in active queries
        if (options.where.active === true) {
          options.where.expiresAt = {
            [sequelize.Sequelize.Op.or]: [
              { [sequelize.Sequelize.Op.gt]: new Date() },
              { [sequelize.Sequelize.Op.is]: null }
            ]
          };
        }
      }
    }
  });

  // Associations
  EncryptionKey.associate = (models) => {
    // Key belongs to a user
    EncryptionKey.belongsTo(models.User, {
      foreignKey: 'userId',
      as: 'user'
    });
  };

  // Instance methods
  EncryptionKey.prototype.isExpired = function() {
    if (!this.expiresAt) return false;
    return new Date() > this.expiresAt;
  };

  EncryptionKey.prototype.updateLastUsed = async function() {
    this.lastUsedAt = new Date();
    await this.save();
  };

  EncryptionKey.prototype.deactivate = async function() {
    this.active = false;
    await this.save();
  };

  // Class methods
  EncryptionKey.findActiveByUser = async function(userId) {
    return await this.findOne({
      where: {
        userId,
        active: true
      },
      order: [['createdAt', 'DESC']]
    });
  };

  EncryptionKey.findByFingerprint = async function(fingerprint) {
    return await this.findOne({
      where: { keyFingerprint: fingerprint }
    });
  };

  EncryptionKey.findByUserAndDevice = async function(userId, deviceId) {
    return await this.findAll({
      where: {
        userId,
        deviceId
      },
      order: [['createdAt', 'DESC']]
    });
  };

  return EncryptionKey;
};
