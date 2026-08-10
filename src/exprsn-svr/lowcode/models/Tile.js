/**
 * Tile Model
 *
 * Represents a tile/tool in the Business Hub application designer.
 * Tiles are the building blocks that appear in the app-designer-enhanced view.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Tile = sequelize.define('Tile', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    key: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: true,
        is: /^[a-z][a-z0-9_-]*$/i,
      },
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255],
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    icon: {
      type: DataTypes.STRING(100),
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    iconGradient: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'icon_gradient',
    },
    route: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    category: {
      type: DataTypes.ENUM('data', 'design', 'automation', 'integration', 'security', 'analytics', 'system'),
      allowNull: false,
      defaultValue: 'design',
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'sort_order',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    isNew: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_new',
    },
    isEnhanced: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_enhanced',
    },
    badgeText: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'badge_text',
    },
    badgeColor: {
      type: DataTypes.ENUM('primary', 'success', 'warning', 'danger', 'info'),
      allowNull: false,
      defaultValue: 'success',
      field: 'badge_color',
    },
    requiredPermissions: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: [],
      field: 'required_permissions',
      validate: {
        isArray(value) {
          if (value && !Array.isArray(value)) {
            throw new Error('Required permissions must be an array');
          }
        },
      },
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'tiles',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['key'] },
      { fields: ['category'] },
      { fields: ['sort_order'] },
      { fields: ['is_active'] },
    ],
  });

  Tile.associate = (models) => {
    // Many-to-many relationship with Applications through ApplicationTile
    Tile.belongsToMany(models.Application, {
      through: models.ApplicationTile,
      foreignKey: 'tileId',
      as: 'applications',
    });

    // Direct association with ApplicationTile for eager loading
    Tile.hasMany(models.ApplicationTile, {
      foreignKey: 'tileId',
      as: 'applicationTiles',
    });
  };

  // Instance methods
  Tile.prototype.isAccessibleBy = function(permissions) {
    if (!this.requiredPermissions || this.requiredPermissions.length === 0) {
      return true;
    }

    if (!permissions || !Array.isArray(permissions)) {
      return false;
    }

    // Check if user has ALL required permissions
    return this.requiredPermissions.every(required =>
      permissions.includes(required)
    );
  };

  // Class methods
  Tile.getActiveByCategory = async function(category) {
    return await this.findAll({
      where: {
        category,
        isActive: true,
      },
      order: [['sortOrder', 'ASC'], ['name', 'ASC']],
    });
  };

  Tile.getAll = async function(options = {}) {
    const {
      category,
      includeInactive = false,
      sortBy = 'sortOrder',
      sortOrder = 'ASC',
    } = options;

    const where = {};
    if (category) where.category = category;
    if (!includeInactive) where.isActive = true;

    return await this.findAll({
      where,
      order: [[sortBy, sortOrder]],
    });
  };

  return Tile;
};
