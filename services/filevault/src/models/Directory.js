/**
 * ═══════════════════════════════════════════════════════════════════════
 * Directory Model
 * ═══════════════════════════════════════════════════════════════════════
 */

const { v4: uuidv4 } = require('uuid');

module.exports = (sequelize, DataTypes) => {
  const Directory = sequelize.define('Directory', {
    id: {
      type: DataTypes.UUID,
      primaryKey: true,
      defaultValue: () => uuidv4()
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
      comment: 'Owner of the directory'
    },
    parentId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'parent_id',
      references: {
        model: 'directories',
        key: 'id'
      },
      comment: 'Parent directory (null for root)'
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      comment: 'Directory name'
    },
    path: {
      type: DataTypes.STRING(1000),
      allowNull: false,
      comment: 'Full directory path'
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {}
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
    tableName: 'directories',
    indexes: [
      { fields: ['user_id'] },
      { fields: ['parent_id'] },
      { fields: ['path'], unique: true },
      { fields: ['is_deleted'] }
    ]
  });

  Directory.associate = function(models) {
    Directory.belongsTo(Directory, {
      foreignKey: 'parent_id',
      as: 'parent'
    });
    Directory.hasMany(Directory, {
      foreignKey: 'parent_id',
      as: 'subdirectories'
    });
    Directory.hasMany(models.File, {
      foreignKey: 'directory_id',
      as: 'files'
    });
  };

  return Directory;
};
