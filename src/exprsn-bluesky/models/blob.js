module.exports = (sequelize, DataTypes) => {
  const Blob = sequelize.define('Blob', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    repositoryId: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'repositories',
        key: 'id'
      }
    },
    cid: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,
      comment: 'Content identifier (hash of blob)'
    },
    mimeType: {
      type: DataTypes.STRING(255),
      allowNull: false
    },
    size: {
      type: DataTypes.INTEGER,
      allowNull: false
    },
    exprsnFileId: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'Linked Exprsn Filevault file ID'
    },
    storageType: {
      type: DataTypes.ENUM('filevault', 'local', 's3', 'ipfs'),
      defaultValue: 'filevault'
    },
    storagePath: {
      type: DataTypes.STRING(512),
      allowNull: true,
      comment: 'Storage path or URL'
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Image width (if applicable)'
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'Image height (if applicable)'
    },
    altText: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      comment: 'Additional blob metadata'
    }
  }, {
    tableName: 'blobs',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['repository_id'] },
      { fields: ['cid'], unique: true },
      { fields: ['mime_type'] },
      { fields: ['exprsn_file_id'] },
      { fields: ['storage_type'] },
      { fields: ['created_at'] }
    ]
  });

  Blob.associate = (models) => {
    Blob.belongsTo(models.Repository, {
      foreignKey: 'repositoryId',
      as: 'repository'
    });
  };

  return Blob;
};
