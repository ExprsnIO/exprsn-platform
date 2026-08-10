/**
 * ═══════════════════════════════════════════════════════════
 * HTML Project Model
 * Top-level container for HTML application projects
 * ═══════════════════════════════════════════════════════════
 */

const { DataTypes } = require('sequelize');

module.exports = (sequelize) => {
  const HtmlProject = sequelize.define('HtmlProject', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true
    },
    applicationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'application_id',
      comment: 'Optional link to Low-Code application'
    },
    name: {
      type: DataTypes.STRING(200),
      allowNull: false,
      validate: {
        notEmpty: true,
        len: [1, 200]
      }
    },
    slug: {
      type: DataTypes.STRING(200),
      allowNull: false,
      unique: true,
      validate: {
        is: /^[a-z0-9-]+$/i
      }
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: true
    },
    ownerId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'owner_id'
    },
    organizationId: {
      type: DataTypes.UUID,
      allowNull: true,
      field: 'organization_id'
    },
    status: {
      type: DataTypes.ENUM('draft', 'development', 'staging', 'production', 'archived'),
      defaultValue: 'draft',
      allowNull: false
    },
    settings: {
      type: DataTypes.JSONB,
      defaultValue: {},
      get() {
        const value = this.getDataValue('settings');
        return value || {};
      }
    },
    metadata: {
      type: DataTypes.JSONB,
      defaultValue: {},
      get() {
        const value = this.getDataValue('metadata');
        return value || {};
      }
    }
  }, {
    tableName: 'html_projects',
    underscored: true,
    timestamps: true,
    indexes: [
      { fields: ['owner_id'] },
      { fields: ['organization_id'] },
      { fields: ['application_id'] },
      { fields: ['slug'], unique: true },
      { fields: ['status'] }
    ]
  });

  /**
   * Instance Methods
   */
  HtmlProject.prototype.toSafeObject = function() {
    return {
      id: this.id,
      applicationId: this.applicationId,
      name: this.name,
      slug: this.slug,
      description: this.description,
      ownerId: this.ownerId,
      organizationId: this.organizationId,
      status: this.status,
      settings: this.settings,
      metadata: this.metadata,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  };

  /**
   * Associations
   */
  HtmlProject.associate = (models) => {
    // Link to Low-Code Application (optional)
    if (models.Application) {
      HtmlProject.belongsTo(models.Application, {
        foreignKey: 'applicationId',
        as: 'application'
      });
    }

    // Files in this project
    HtmlProject.hasMany(models.HtmlFile, {
      foreignKey: 'projectId',
      as: 'files'
    });

    // Libraries used in this project
    HtmlProject.belongsToMany(models.HtmlLibrary, {
      through: models.HtmlProjectLibrary,
      foreignKey: 'projectId',
      otherKey: 'libraryId',
      as: 'libraries'
    });

    // Components used in this project
    HtmlProject.belongsToMany(models.HtmlComponent, {
      through: models.HtmlProjectComponent,
      foreignKey: 'projectId',
      otherKey: 'componentId',
      as: 'components'
    });

    // Snapshots of this project
    HtmlProject.hasMany(models.HtmlProjectSnapshot, {
      foreignKey: 'projectId',
      as: 'snapshots'
    });

    // Deployments of this project
    HtmlProject.hasMany(models.HtmlProjectDeployment, {
      foreignKey: 'projectId',
      as: 'deployments'
    });

    // Data sources for this project
    HtmlProject.hasMany(models.HtmlDataSource, {
      foreignKey: 'projectId',
      as: 'dataSources'
    });

    // Collaboration sessions
    HtmlProject.hasMany(models.HtmlCollaborationSession, {
      foreignKey: 'projectId',
      as: 'collaborationSessions'
    });
  };

  return HtmlProject;
};
