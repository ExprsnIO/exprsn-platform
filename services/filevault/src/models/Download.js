/**
 * ═══════════════════════════════════════════════════════════════════════
 * Download Model - Download tracking
 * ═══════════════════════════════════════════════════════════════════════
 */

module.exports = (sequelize, DataTypes) => {
  const Download = sequelize.define('Download', {
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
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      comment: 'User who downloaded the file (null for anonymous)'
    },
    ip_address: {
      type: DataTypes.INET,
      allowNull: true,
      comment: 'IP address of downloader'
    },
    user_agent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User agent string'
    },
    downloaded_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
      comment: 'When the file was downloaded'
    }
  }, {
    tableName: 'downloads',
    timestamps: false,
    underscored: true,
    indexes: [
      {
        fields: ['file_id']
      },
      {
        fields: ['user_id']
      },
      {
        fields: ['downloaded_at']
      },
      {
        fields: ['ip_address']
      }
    ]
  });

  Download.associate = (models) => {
    // BUG-025: align model to live DB — downloads.file_id is ON DELETE CASCADE
    // (download records are dependents of their file and die with it).
    Download.belongsTo(models.File, {
      foreignKey: { name: 'file_id', allowNull: false },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
      as: 'file'
    });
  };

  return Download;
};
