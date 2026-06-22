/**
 * ═══════════════════════════════════════════════════════════
 * OAuth2Client Model
 * OAuth2 client applications
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');
const crypto = require('crypto');
const bcrypt = require('bcrypt');

const BCRYPT_ROUNDS = 10;

/**
 * Returns true if the value already looks like a bcrypt hash
 */
function isBcryptHash(value) {
  return typeof value === 'string' && value.startsWith('$2');
}

module.exports = (sequelize) => {
  const OAuth2Client = sequelize.define('OAuth2Client', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },

    clientId: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },

    clientSecret: {
      type: DataTypes.STRING,
      allowNull: false
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },

    // Redirect URIs (whitelist)
    redirectUris: {
      type: DataTypes.JSON,
      defaultValue: []
    },

    // Grant types allowed for this client
    grants: {
      type: DataTypes.JSON,
      defaultValue: ['authorization_code', 'refresh_token']
    },

    // Scope allowed for this client
    scopes: {
      type: DataTypes.JSON,
      defaultValue: ['read', 'write']
    },

    // Client type
    type: {
      type: DataTypes.ENUM('confidential', 'public'),
      defaultValue: 'confidential'
    },

    // Owner/creator of the client
    ownerId: {
      type: DataTypes.UUID,
      allowNull: true,
      references: {
        model: 'users',
        key: 'id'
      }
    },

    // Status
    status: {
      type: DataTypes.ENUM('active', 'inactive', 'revoked'),
      defaultValue: 'active'
    },

    // Metadata
    metadata: {
      type: DataTypes.JSON,
      defaultValue: {}
    }
  }, {
    tableName: 'oauth2_clients',
    timestamps: true,
    indexes: [
      { fields: ['clientId'] },
      { fields: ['ownerId'] },
      { fields: ['status'] }
    ]
  });

  /**
   * Generate client ID and secret before creating.
   * The clientSecret column stores a bcrypt HASH only. The plaintext secret
   * is exposed exactly once on the instance as `client.plaintextSecret`
   * (non-persisted) so the creation flow can return it to the caller.
   */
  OAuth2Client.beforeCreate(async (client) => {
    if (!client.clientId) {
      client.clientId = crypto.randomBytes(16).toString('hex');
    }
    if (!client.clientSecret) {
      client.clientSecret = crypto.randomBytes(32).toString('hex');
    }
    if (!isBcryptHash(client.clientSecret)) {
      // Expose plaintext once (instance property, never persisted)
      client.plaintextSecret = client.clientSecret;
      client.clientSecret = await bcrypt.hash(client.clientSecret, BCRYPT_ROUNDS);
    }
  });

  /**
   * Hash secret on update (e.g. secret rotation). Skips values that are
   * already bcrypt hashes (e.g. migration re-hash-on-verify).
   */
  OAuth2Client.beforeUpdate(async (client) => {
    if (client.changed('clientSecret') && !isBcryptHash(client.clientSecret)) {
      client.plaintextSecret = client.clientSecret;
      client.clientSecret = await bcrypt.hash(client.clientSecret, BCRYPT_ROUNDS);
    }
  });

  return OAuth2Client;
};
