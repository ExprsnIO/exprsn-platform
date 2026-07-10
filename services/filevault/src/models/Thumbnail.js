/**
 * ═══════════════════════════════════════════════════════════════════════
 * Thumbnail Model - Thumbnail cache
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = (sequelize, DataTypes) => {
  const Thumbnail = sequelize.define('Thumbnail', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    file_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: {
        model: 'files',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    size: {
      type: DataTypes.ENUM('small', 'medium', 'large'),
      allowNull: false,
      comment: 'Thumbnail size variant'
    },
    width: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Thumbnail width in pixels'
    },
    height: {
      type: DataTypes.INTEGER,
      allowNull: false,
      comment: 'Thumbnail height in pixels'
    },
    storage_key: {
      type: DataTypes.STRING(512),
      allowNull: false,
      comment: 'Key/path in storage backend'
    },
    storage_backend: {
      type: DataTypes.ENUM('s3', 'disk', 'ipfs'),
      allowNull: false,
      defaultValue: 's3',
      comment: 'Storage backend where thumbnail is stored'
    }
  }, {
    tableName: 'thumbnails',
    timestamps: true,
    underscored: true,
    indexes: [
      {
        fields: ['file_id']
      },
      {
        fields: ['file_id', 'size'],
        unique: true
      }
    ]
  });

  Thumbnail.associate = (models) => {
    // BUG-025: align model to live DB — thumbnails.file_id is ON DELETE CASCADE
    // (a thumbnail is a dependent of its file and dies with it).
    Thumbnail.belongsTo(models.File, {
      foreignKey: { name: 'file_id', allowNull: false },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      as: 'file'
    });
  };

  return Thumbnail;
};
