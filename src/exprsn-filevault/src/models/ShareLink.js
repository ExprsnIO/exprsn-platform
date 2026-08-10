/**
 * ═══════════════════════════════════════════════════════════════════════
 * ShareLink Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const ShareLink = sequelize.define('ShareLink', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    fileId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'file_id',
      references: {
        model: 'files',
        key: 'id'
      }
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      comment: 'User who created the share link'
    },
    tokenId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'token_id',
      comment: 'CA token ID for access control'
    },
    shareType: {
      type: DataTypes.ENUM('link', 'direct'),
      allowNull: false,
      field: 'share_type',
      defaultValue: 'link'
    },
    permissions: {
      type: DataTypes.JSONB,
      allowNull: false,
      defaultValue: { read: true, write: false, delete: false }
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'expires_at'
    },
    maxUses: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'max_uses'
    },
    useCount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'use_count',
      defaultValue: 0
    },
    isRevoked: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'is_revoked',
      defaultValue: false
    },
    revokedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'revoked_at'
    }
  }, {
    tableName: 'share_links',
    indexes: [
      { fields: ['file_id'] },
      { fields: ['user_id'] },
      { fields: ['token_id'] },
      { fields: ['expires_at'] },
      { fields: ['is_revoked'] }
    ]
  });

  ShareLink.associate = function(models) {
    ShareLink.belongsTo(models.File, {
      foreignKey: 'file_id',
      as: 'file'
    });
  };

  return ShareLink;
};
