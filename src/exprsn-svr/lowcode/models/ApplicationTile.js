/**
 * ApplicationTile Model
 *
 * Join table for managing which tiles are enabled/configured for each application.
 * Allows per-application customization of tiles.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const ApplicationTile = sequelize.define('ApplicationTile', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'application_id',
      references: {
        model: 'applications',
        key: 'id',
      },
    },
    tileId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'tile_id',
      references: {
        model: 'tiles',
        key: 'id',
      },
    },
    isEnabled: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_enabled',
    },
    customName: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'custom_name',
      validate: {
        len: [0, 255],
      },
    },
    customDescription: {
      type: DataTypes.TEXT,
      allowNull: true,
      field: 'custom_description',
    },
    customIcon: {
      type: DataTypes.STRING(100),
      allowNull: true,
      field: 'custom_icon',
    },
    sortOrder: {
      type: DataTypes.INTEGER,
      allowNull: true,
      field: 'sort_order',
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
  }, {
    tableName: 'application_tiles',
    timestamps: true,
    underscored: true,
    indexes: [
      { fields: ['application_id'] },
      { fields: ['tile_id'] },
      {
        fields: ['application_id', 'tile_id'],
        unique: true,
        name: 'application_tiles_unique_constraint'
      },
      { fields: ['is_enabled'] },
    ],
  });

  ApplicationTile.associate = (models) => {
    // Belongs to Application
    ApplicationTile.belongsTo(models.Application, {
      foreignKey: 'applicationId',
      as: 'application',
    });

    // Belongs to Tile
    ApplicationTile.belongsTo(models.Tile, {
      foreignKey: 'tileId',
      as: 'tile',
    });
  };

  // Instance methods
  ApplicationTile.prototype.getEffectiveName = function() {
    return this.customName || this.tile?.name || 'Unnamed Tile';
  };

  ApplicationTile.prototype.getEffectiveDescription = function() {
    return this.customDescription || this.tile?.description || '';
  };

  ApplicationTile.prototype.getEffectiveIcon = function() {
    return this.customIcon || this.tile?.icon || 'fas fa-cube';
  };

  ApplicationTile.prototype.getEffectiveSortOrder = function() {
    return this.sortOrder !== null ? this.sortOrder : (this.tile?.sortOrder || 0);
  };

  // Class methods
  ApplicationTile.enableForApplication = async function(applicationId, tileId, customSettings = {}) {
    const [appTile, created] = await this.findOrCreate({
      where: { applicationId, tileId },
      defaults: {
        isEnabled: true,
        ...customSettings,
      },
    });

    if (!created && !appTile.isEnabled) {
      appTile.isEnabled = true;
      await appTile.save();
    }

    return appTile;
  };

  ApplicationTile.disableForApplication = async function(applicationId, tileId) {
    const appTile = await this.findOne({
      where: { applicationId, tileId },
    });

    if (appTile) {
      appTile.isEnabled = false;
      await appTile.save();
    }

    return appTile;
  };

  ApplicationTile.getEnabledTiles = async function(applicationId, options = {}) {
    const { includeTile = true } = options;

    const query = {
      where: {
        applicationId,
        isEnabled: true,
      },
      order: [
        [sequelize.fn('COALESCE', sequelize.col('ApplicationTile.sort_order'), sequelize.col('tile.sort_order'), 0), 'ASC'],
        ['created_at', 'ASC'],
      ],
    };

    if (includeTile) {
      query.include = [{
        model: sequelize.models.Tile,
        as: 'tile',
        where: { isActive: true },
      }];
    }

    return await this.findAll(query);
  };

  return ApplicationTile;
};
