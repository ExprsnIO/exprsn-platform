/**
 * ═══════════════════════════════════════════════════════════════════════
 * FileBlob Model - Actual file storage reference with deduplication
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = (sequelize, DataTypes) => {
  const FileBlob = sequelize.define('FileBlob', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    checksum: {
      type: DataTypes.STRING(64),
      allowNull: false,
      unique: true,
      comment: 'SHA256 hash of file content for deduplication'
    },
    size: {
      type: DataTypes.BIGINT,
      allowNull: false,
      comment: 'File size in bytes'
    },
    storage_backend: {
      type: DataTypes.ENUM('s3', 'disk', 'ipfs'),
      allowNull: false,
      defaultValue: 's3',
      comment: 'Storage backend where file is stored'
    },
    storage_key: {
      type: DataTypes.STRING(512),
      allowNull: false,
      comment: 'Key/path in storage backend'
    },
    ref_count: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
      comment: 'Number of files referencing this blob'
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional metadata about the blob'
    }
  }, {
    tableName: 'file_blobs',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['checksum'],
        unique: true
      },
      {
        fields: ['storage_backend']
      },
      {
        fields: ['ref_count']
      },
      {
        fields: ['size']
      }
    ]
  });

  FileBlob.associate = (models) => {
    // A blob can be referenced by multiple files
    FileBlob.hasMany(models.File, {
      foreignKey: 'blob_id',
      as: 'files'
    });

    // A blob can have multiple versions
    FileBlob.hasMany(models.FileVersion, {
      foreignKey: 'blob_id',
      as: 'versions'
    });
  };

  return FileBlob;
};
