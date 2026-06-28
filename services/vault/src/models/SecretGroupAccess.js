/**
 * SecretGroupAccess Model (Phase 6 — Shared keys / secrets for groups)
 *
 * ACL row recording that a nexus group has been granted access to an existing
 * secret, and at what level. This is deliberately a SEPARATE table from
 * `secrets` so the Secret model stays unchanged (no owner/ACL columns) — the
 * grant relationship lives here.
 *
 * How this relates to VaultToken (entityType:'group'):
 *   - SecretGroupAccess is the *grant ledger*: it records which group may use
 *     which secret and at what permission level, and it powers the
 *     membership-gated group routes (metadata listing + the explicit admin
 *     reveal). It does NOT itself mint a credential.
 *   - A group's VaultToken (entityType:'group', with pathPrefixes/permissions)
 *     remains the underlying bearer credential group members operate under for
 *     raw path access via the existing /api/secrets/:path routes.
 *   Keep the two in agreement operationally: granting ACL access typically
 *   accompanies a group VaultToken scoped to the secret's path.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const SecretGroupAccess = sequelize.define('SecretGroupAccess', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    secretId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'secrets',
        key: 'id'
      },
      comment: 'Secret this grant applies to'
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: false,
      comment: 'nexus group granted access'
    },
    permission: {
      type: DataTypes.ENUM('read', 'write', 'manage'),
      allowNull: false,
      defaultValue: 'read',
      comment: 'Granted access level for the group'
    },
    grantedBy: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'User id that granted access (audit attribution)'
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: 'Optional grant expiration; null = no expiry'
    }
  }, {
    tableName: 'secret_group_access',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['secret_id', 'group_id'],
        unique: true,
        name: 'secret_group_access_secret_group_unique'
      },
      {
        fields: ['group_id'],
        name: 'secret_group_access_group_id_idx'
      }
    ]
  });

  SecretGroupAccess.associate = (models) => {
    SecretGroupAccess.belongsTo(models.Secret, {
      foreignKey: 'secretId',
      as: 'secret'
    });
    models.Secret.hasMany(SecretGroupAccess, {
      foreignKey: 'secretId',
      as: 'groupAccess'
    });
  };

  return SecretGroupAccess;
};
