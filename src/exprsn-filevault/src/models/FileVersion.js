/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileVersion Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const FileVersion = sequelize.define('FileVersion', {
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
    version: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Version number'
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      comment: 'User who created this version'
    },
    size: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: 'File size in bytes'
    },
    contentHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'content_hash',
      comment: 'SHA-256 hash of this version'
    },
    storageBackend: {
      type: DataTypes.ENUM('disk', 's3', 'ipfs'),
      allowNull: false,
      field: 'storage_backend'
    },
    storageKey: {
      type: DataTypes.STRING(500),
      allowNull: false,
      field: 'storage_key',
      comment: 'Key/path in storage backend'
    },
    changeDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'change_description',
      comment: 'Description of changes in this version'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
    }
  }, {
    tableName: 'file_versions',
    indexes: [
      { fields: ['file_id', 'version'], unique: true },
      { fields: ['content_hash'] },
      { fields: ['created_at'] }
    ]
  });

  FileVersion.associate = function(models) {
    FileVersion.belongsTo(models.File, {
      foreignKey: 'file_id',
      as: 'file'
    });
  };

  return FileVersion;
};
