/**
 * Application Model
 *
 * Represents a low-code application container.
 * Applications contain entities, forms, processes, and other resources.
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const Application = sequelize.define('Application', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
      allowNull: false,
    },
    name: {
      type: DataTypes.STRING(255),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 255],
      },
    },
    displayName: {
      type: DataTypes.STRING(255),
      allowNull: false,
      field: 'display_name',
      validate: {
        notEmpty: true,
        len: [1, 255],
      },
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    version: {
      type: DataTypes.STRING(50),
      allowNull: false,
      defaultValue: '1.0.0',
      validate: {
        is: /^\d+\.\d+\.\d+$/,
      },
    },
    status: {
      type: DataTypes.ENUM('draft', 'active', 'inactive', 'archived'),
      allowNull: false,
      defaultValue: 'draft',
    },
    ownerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'owner_id',
    },
    icon: {
      type: DataTypes.STRING(500),
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING(50),
      allowNull: true,
      defaultValue: '#0078D4',
      validate: {
        is: /^#[0-9A-Fa-f]{6}$/,
      },
    },
    settings: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    metadata: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: {},
    },
    gitRepository: {
      type: DataTypes.STRING(500),
      allowNull: true,
      field: 'git_repository',
      validate: {
        isUrl: true,
      },
    },
    gitBranch: {
      type: DataTypes.STRING(255),
      allowNull: true,
      defaultValue: 'main',
      field: 'git_branch',
    },
    publishedVersion: {
      type: DataTypes.STRING(50),
      allowNull: true,
      field: 'published_version',
    },
    publishedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'published_at',
    },
  }, {
    tableName: 'applications',
    timestamps: true,
    underscored: true,
    paranoid: true, // Soft deletes
    indexes: [
      { fields: ['owner_id'] },
      { fields: ['status'] },
      { fields: ['created_at'] },
      { fields: ['name'] },
    ],
  });

  Application.associate = (models) => {
    // One application has many entities
    Application.hasMany(models.Entity, {
      foreignKey: 'applicationId',
      as: 'entities',
      onDelete: 'CASCADE',
    });

    // One application has many forms
    Application.hasMany(models.AppForm, {
      foreignKey: 'applicationId',
      as: 'forms',
      onDelete: 'CASCADE',
    });

    // One application has many grids
    Application.hasMany(models.Grid, {
      foreignKey: 'applicationId',
      as: 'grids',
      onDelete: 'CASCADE',
    });

    // One application has many cards
    Application.hasMany(models.Card, {
      foreignKey: 'applicationId',
      as: 'cards',
      onDelete: 'CASCADE',
    });

    // One application has many data sources
    Application.hasMany(models.DataSource, {
      foreignKey: 'applicationId',
      as: 'dataSources',
      onDelete: 'CASCADE',
    });

    // One application has many queries
    Application.hasMany(models.Query, {
      foreignKey: 'applicationId',
      as: 'queries',
      onDelete: 'CASCADE',
    });

    // One application has many polls
    Application.hasMany(models.Poll, {
      foreignKey: 'applicationId',
      as: 'polls',
      onDelete: 'CASCADE',
    });

    // One application has many processes
    Application.hasMany(models.Process, {
      foreignKey: 'applicationId',
      as: 'processes',
      onDelete: 'CASCADE',
    });

    // One application has many decision tables
    Application.hasMany(models.DecisionTable, {
      foreignKey: 'applicationId',
      as: 'decisionTables',
      onDelete: 'CASCADE',
    });

    // One application has many global variables
    Application.hasMany(models.GlobalVariable, {
      foreignKey: 'applicationId',
      as: 'globalVariables',
      onDelete: 'CASCADE',
    });

    // Many-to-many relationship with Tiles through ApplicationTile
    Application.belongsToMany(models.Tile, {
      through: models.ApplicationTile,
      foreignKey: 'applicationId',
      as: 'tiles',
    });

    // Direct association with ApplicationTile for eager loading
    Application.hasMany(models.ApplicationTile, {
      foreignKey: 'applicationId',
      as: 'applicationTiles',
    });
  };

  // Instance methods
  Application.prototype.publish = async function() {
    this.publishedVersion = this.version;
    this.publishedAt = new Date();
    this.status = 'active';
    return await this.save();
  };

  Application.prototype.archive = async function() {
    this.status = 'archived';
    return await this.save();
  };

  Application.prototype.incrementVersion = function(type = 'patch') {
    const [major, minor, patch] = this.version.split('.').map(Number);

    switch (type) {
      case 'major':
        this.version = `${major + 1}.0.0`;
        break;
      case 'minor':
        this.version = `${major}.${minor + 1}.0`;
        break;
      case 'patch':
      default:
        this.version = `${major}.${minor}.${patch + 1}`;
        break;
    }

    return this.version;
  };

  return Application;
};
