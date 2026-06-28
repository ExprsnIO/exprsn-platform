/**
 * ═══════════════════════════════════════════════════════════════════════
 * File Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const File = sequelize.define('File', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      comment: 'Owning user (for user-owned files) / uploading user (for group-owned files)'
    },
    ownerType: {
      type: DataTypes.ENUM('user', 'group'),
      allowNull: false,
      field: 'owner_type',
      defaultValue: 'user',
      comment: 'Whether this file belongs to a user or a group'
    },
    groupId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'group_id',
      comment: 'Owning group id when owner_type = group (nexus group id)'
    },
    directoryId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'directory_id',
      references: {
        model: 'directories',
        key: 'id'
      }
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'File name'
    },
    path: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      comment: 'Full file path'
    },
    size: {
      type: DataTypes.BIGINT,
      allowNull: false,
      defaultValue: 0,
      comment: 'File size in bytes'
    },
    mimetype: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'application/octet-stream'
    },
    contentHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'content_hash',
      comment: 'SHA-256 hash of file content'
    },
    storageBackend: {
      type: DataTypes.ENUM('disk', 's3', 'ipfs'),
      allowNull: false,
      field: 'storage_backend',
      defaultValue: 's3'
    },
    storageKey: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'storage_key',
      comment: 'Key/path in storage backend'
    },
    currentVersion: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'current_version',
      defaultValue: 1
    },
    tags: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      allowNull: true,
      defaultValue: []
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    },
    visibility: {
      type: DataTypes.ENUM('private', 'shared', 'public'),
      allowNull: false,
      defaultValue: 'private'
    },
    isDeleted: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      field: 'is_deleted',
      defaultValue: false
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'deleted_at'
    }
  }, {
    tableName: 'files',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['directory_id'] },
      { fields: ['content_hash'] },
      { fields: ['path'] },
      { fields: ['created_at'] },
      { fields: ['is_deleted'] },
      { fields: ['group_id', 'owner_type', 'is_deleted'] }
    ]
  });

  File.associate = function(models) {
    File.belongsTo(models.Directory, {
      foreignKey: 'directory_id',
      as: 'directory'
    });
    File.hasMany(models.FileVersion, {
      foreignKey: 'file_id',
      as: 'versions'
    });
    File.hasMany(models.ShareLink, {
      foreignKey: 'file_id',
      as: 'shareLinks'
    });
  };

  return File;
};
